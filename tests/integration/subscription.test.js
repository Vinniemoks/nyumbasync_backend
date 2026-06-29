const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock the Daraja HTTP layer — we can't reach Safaricom in tests, so we
// assert the wiring around it (pending payment, callback activation).
jest.mock('../../services/mpesa.service', () => ({
  isConfigured: jest.fn(() => true),
  initiateSTKPush: jest.fn(async () => ({
    MerchantRequestID: 'mer-sub-1',
    CheckoutRequestID: 'ws_CO_SUB_TEST123',
    ResponseCode: '0',
  })),
}));

const mpesaService = require('../../services/mpesa.service');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Subscription = require('../../models/subscription.model');
const MaintenanceRequest = require('../../models/maintenance-request.model');
const subscriptionController = require('../../controllers/subscription.controller');

require('./setup');

let mongoServer;

describe('Integration: Subscriptions', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Subscription.deleteMany({});
    await MaintenanceRequest.deleteMany({});
  });

  it('provisions a Free subscription on signup for a billable role', async () => {
    const { user } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord',
      phone: '254712345691',
      role: 'landlord',
    });

    const subscription = await Subscription.findOne({ user: user.id });
    expect(subscription).not.toBeNull();
    expect(subscription.tier).toBe('free');
    expect(subscription.status).toBe('active');
  });

  it('does not provision a subscription for tenants', async () => {
    const { user } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'tenant@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Tenant',
      phone: '254712345692',
      role: 'tenant',
    });

    const subscription = await Subscription.findOne({ user: user.id });
    expect(subscription).toBeNull();
  });

  it('returns current tier and usage from GET /subscriptions/me', async () => {
    const { token } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord2@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord2',
      phone: '254712345693',
      role: 'landlord',
    });

    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.subscription.tier).toBe('free');
    expect(res.body.usage).toEqual({ used: 0, limit: 3 });
  });

  it('blocks property creation past the Free tier unit limit (402)', async () => {
    const { token, userId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord3@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord3',
      phone: '254712345694',
      role: 'landlord',
    });

    // Free tier allows 3 units — seed 3 directly, then the 4th create should 402.
    await Property.create([1, 2, 3].map((n) => ({
      title: `Unit ${n}`,
      description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
      type: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      landlord: userId,
      address: { street: `${n} Test Rd`, area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
      rent: { amount: 20000 },
      deposit: 20000,
    })));

    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'One Too Many',
        description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
        type: 'apartment',
        bedrooms: 2,
        bathrooms: 2,
        address: { street: '4 Test Rd', area: 'Riverside', city: 'Nairobi', county: 'Nairobi' },
        rent: { amount: 20000 },
        deposit: 20000,
      });

    expect(res.status).toBe(402);
    expect(res.body.usage).toEqual({ used: 3, limit: 3, tier: 'free' });
  });

  it('records a pending upgrade without unlocking the higher limit until payment confirms', async () => {
    const { token } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord4@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord4',
      phone: '254712345695',
      role: 'landlord',
    });

    const res = await request(app)
      .post('/api/v1/subscriptions/upgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'starter', billingCycle: 'monthly' });

    expect(res.status).toBe(200);
    // tier stays 'free' (still the only thing actually paid for) — only the
    // pending fields and amount due reflect the requested upgrade.
    expect(res.body.subscription.tier).toBe('free');
    expect(res.body.subscription.status).toBe('pending');
    expect(res.body.subscription.pendingTier).toBe('starter');
    expect(res.body.amountDue).toBe(1500);
  });

  it('blocks assigning an agent past their Free tier listing limit (402)', async () => {
    const { token: landlordToken, userId: landlordId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord5@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord5',
      phone: '254712345696',
      role: 'landlord',
    });
    const { userId: agentId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'agent@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Agent',
      phone: '254712345697',
      role: 'agent',
    });
    // A separate landlord owns the agent's existing 5 listings, so the
    // requesting landlord's own (well under-limit) unit count doesn't
    // trigger a 402 of its own and muddy this assertion.
    const { userId: otherLandlordId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord6@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord6',
      phone: '254712345699',
      role: 'landlord',
    });

    // Free tier allows 5 listings for an agent — seed 5 already assigned to them.
    await Property.create(Array.from({ length: 5 }, (_, i) => ({
      title: `Listing ${i}`,
      description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
      type: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      landlord: otherLandlordId,
      agent: agentId,
      address: { street: `${i} Listing Rd`, area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
      rent: { amount: 20000 },
      deposit: 20000,
    })));

    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        title: 'One Listing Too Many',
        description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
        type: 'apartment',
        bedrooms: 2,
        bathrooms: 2,
        agent: agentId,
        address: { street: '6 Listing Rd', area: 'Riverside', city: 'Nairobi', county: 'Nairobi' },
        rent: { amount: 20000 },
        deposit: 20000,
      });

    expect(res.status).toBe(402);
    expect(res.body.usage).toEqual({ used: 5, limit: 5, tier: 'free' });
  });

  it('blocks assigning a vendor past their Free tier active-job limit (402)', async () => {
    const { userId: vendorId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'vendor@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Vendor',
      phone: '254712345698',
      role: 'vendor',
    });

    // Free tier allows 5 active jobs for a vendor — seed 5 open jobs already assigned.
    await MaintenanceRequest.create(Array.from({ length: 5 }, () => ({
      tenant: new mongoose.Types.ObjectId(),
      property: new mongoose.Types.ObjectId(),
      category: 'plumbing',
      title: 'Leaky tap',
      description: 'Tap in the kitchen is leaking continuously.',
      location: 'Kitchen',
      vendorUser: vendorId,
      status: 'scheduled',
    })));

    const extraRequest = await MaintenanceRequest.create({
      tenant: new mongoose.Types.ObjectId(),
      property: new mongoose.Types.ObjectId(),
      category: 'electrical',
      title: 'Flickering light',
      description: 'Living room light flickers on and off.',
      location: 'Living Room',
    });

    const res = await request(app)
      .post(`/api/maintenance-requests/${extraRequest._id}/assign`)
      .send({ vendorUserId: vendorId });

    expect(res.status).toBe(402);
    expect(res.body.usage).toEqual({ used: 5, limit: 5, tier: 'free' });
  });

  it('initiates an STK push for a pending upgrade and activates it on a successful callback', async () => {
    const { token, userId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord7@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord7',
      phone: '254712345600',
      role: 'landlord',
    });

    await request(app)
      .post('/api/v1/subscriptions/upgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'starter', billingCycle: 'monthly' });

    const payRes = await request(app)
      .post('/api/v1/subscriptions/upgrade/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '254712345600' });

    expect(payRes.status).toBe(202);
    expect(payRes.body.checkoutRequestId).toBe('ws_CO_SUB_TEST123');
    expect(mpesaService.initiateSTKPush).toHaveBeenCalledWith(
      '254712345600', 1500, expect.stringMatching(/^SUB/)
    );

    let subscription = await Subscription.findOne({ user: userId });
    expect(subscription.status).toBe('pending');
    expect(subscription.tier).toBe('free'); // still not active — awaiting callback

    // Simulate Safaricom's success callback.
    const handled = await subscriptionController.handleMpesaCallback({
      CheckoutRequestID: 'ws_CO_SUB_TEST123',
      ResultCode: 0,
      ResultDesc: 'Success',
    });
    expect(handled).toBe(true);

    subscription = await Subscription.findOne({ user: userId });
    expect(subscription.tier).toBe('starter');
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodEnd).not.toBeNull();
    expect(subscription.pendingTier).toBeNull();
  });

  it('leaves the subscription pending (not active) on a failed callback', async () => {
    const { token, userId } = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord8@subscription.com',
      password: 'Test123!',
      firstName: 'Sub',
      lastName: 'Landlord8',
      phone: '254712345601',
      role: 'landlord',
    });

    await request(app)
      .post('/api/v1/subscriptions/upgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'starter', billingCycle: 'monthly' });

    await request(app)
      .post('/api/v1/subscriptions/upgrade/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '254712345601' });

    await subscriptionController.handleMpesaCallback({
      CheckoutRequestID: 'ws_CO_SUB_TEST123',
      ResultCode: 1032,
      ResultDesc: 'Request cancelled by user',
    });

    const subscription = await Subscription.findOne({ user: userId });
    expect(subscription.tier).toBe('free');
    expect(subscription.status).toBe('pending');
    expect(subscription.pendingTier).toBe('starter');
    expect(subscription.pendingPayment.checkoutRequestId).toBeFalsy();
  });
});
