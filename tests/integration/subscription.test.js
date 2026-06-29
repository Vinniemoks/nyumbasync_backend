const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Subscription = require('../../models/subscription.model');

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
      address: { street: `${n} Test Rd`, area: 'Riverside', city: 'Nairobi', county: 'Nairobi' },
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

  it('records a pending upgrade for a paid tier (no payment gateway yet)', async () => {
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
    expect(res.body.subscription.tier).toBe('starter');
    expect(res.body.subscription.status).toBe('pending');
  });
});
