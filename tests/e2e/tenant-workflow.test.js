const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Maintenance = require('../../models/maintenance.model');

require('./setup');

let mongoServer;

describe('E2E: Tenant Workflow', () => {
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
    await Maintenance.deleteMany({});
  });

  it('should complete tenant onboarding to first maintenance request', async () => {
    // Complete workflow: Signup → Profile → Browse → Request Maintenance
    
    // 1. Tenant signs up
    const tenant = await e2eUtils.completeUserOnboarding(app, request, 'tenant');
    expect(tenant.token).toBeDefined();

    // 2. Tenant completes profile
    await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        firstName: 'Updated',
        lastName: 'Tenant'
      })
      .expect(200);

    // 3. Create landlord and property
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    const property = await e2eUtils.propertyApplicationFlow(
      app,
      request,
      landlord.token,
      tenant.token
    );

    // 4. Tenant browses properties
    const propertiesResponse = await request(app)
      .get('/api/v1/properties/available')
      .expect(200);
    
    expect(propertiesResponse.body.length).toBeGreaterThan(0);

    // 5. Tenant submits maintenance request
    const maintenance = await e2eUtils.maintenanceResolutionFlow(
      app,
      request,
      tenant.token,
      property._id
    );

    expect(maintenance.ticketNumber).toBeDefined();
    expect(maintenance.status).toBe('submitted');

    // 6. Tenant checks request status
    const statusResponse = await request(app)
      .get(`/api/v1/tenant/maintenance/${maintenance.id}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(statusResponse.body.ticketNumber).toBe(maintenance.ticketNumber);
  });

  it('should complete tenant move-out workflow', async () => {
    // Complete workflow: Active Tenant → Move-Out Request → Deposit Refund
    
    const tenant = await e2eUtils.completeUserOnboarding(app, request, 'tenant');
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    const property = await e2eUtils.propertyApplicationFlow(
      app,
      request,
      landlord.token,
      tenant.token
    );

    // Create lease
    const Lease = require('../../models/lease.model');
    const lease = await Lease.create({
      tenant: tenant.user.id,
      property: property._id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-01-01'),
      monthlyRent: 45000,
      securityDeposit: 45000,
      status: 'active'
    });

    // 1. Submit move-out request
    const moveOutResponse = await request(app)
      .post('/api/v1/tenant/move-out/request')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        propertyId: property._id,
        leaseId: lease._id,
        moveOutDate: '2024-12-31',
        reason: 'Job relocation',
        forwardingAddress: '456 New City'
      })
      .expect(201);

    expect(moveOutResponse.body.success).toBe(true);

    // 2. Request deposit refund
    const refundResponse = await request(app)
      .post('/api/v1/tenant/deposit/refund')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        moveOutRequestId: moveOutResponse.body.moveOutRequest.id,
        depositAmount: 45000,
        bankDetails: {
          accountNumber: '9876543210',
          bankName: 'Equity Bank',
          accountName: 'E2E Tenant'
        }
      })
      .expect(201);

    expect(refundResponse.body.success).toBe(true);

    // 3. Check refund status
    const statusResponse = await request(app)
      .get(`/api/v1/tenant/deposit/status/${refundResponse.body.refundRequest.id}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(statusResponse.body.status).toBe('submitted');
  });
});
