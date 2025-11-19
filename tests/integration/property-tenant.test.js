const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Lease = require('../../models/lease.model');

require('./setup');

let mongoServer;

describe('Integration: Property-Tenant Relationship', () => {
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
    await Lease.deleteMany({});
  });

  it('should manage property-tenant lifecycle', async () => {
    // Create landlord and tenant
    const landlord = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'landlord@integration.com',
      password: 'Test123!',
      firstName: 'Integration',
      lastName: 'Landlord',
      phone: '254712345690',
      role: 'landlord'
    });

    const tenant = await integrationUtils.createAuthenticatedUser(app, request, {
      email: 'tenant@integration.com',
      password: 'Test123!',
      firstName: 'Integration',
      lastName: 'Tenant',
      phone: '254712345691',
      role: 'tenant'
    });

    // 1. Landlord creates property
    const property = await integrationUtils.createPropertyWithLandlord(
      app,
      request,
      landlord.token
    );

    // 2. Create lease
    const leaseResponse = await request(app)
      .post('/api/v1/leases')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        tenantId: tenant.userId,
        propertyId: property._id,
        startDate: '2024-01-01',
        endDate: '2025-01-01',
        monthlyRent: 50000,
        securityDeposit: 50000
      })
      .expect(201);

    const leaseId = leaseResponse.body._id;

    // 3. Tenant views their lease
    const tenantLeaseResponse = await request(app)
      .get(`/api/v1/leases/tenant/${tenant.userId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(tenantLeaseResponse.body.length).toBe(1);

    // 4. Landlord views property leases
    const propertyLeasesResponse = await request(app)
      .get(`/api/v1/leases/property/${property._id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(propertyLeasesResponse.body.length).toBe(1);

    // 5. Tenant signs lease
    await request(app)
      .post(`/api/v1/leases/${leaseId}/sign`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        signature: 'base64_signature_data',
        signedDate: new Date().toISOString()
      })
      .expect(200);
  });
});
