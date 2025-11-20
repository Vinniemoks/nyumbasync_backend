const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Vendor = require('../../models/vendor.model');

require('./setup');

let mongoServer;

describe('E2E: Landlord Workflow', () => {
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
    await Vendor.deleteMany({});
  });

  it('should complete landlord property management workflow', async () => {
    // Complete workflow: Signup → Create Property → Manage → Update
    
    // 1. Landlord signs up
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    expect(landlord.token).toBeDefined();

    // 2. Create first property
    const property1Response = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        name: 'First Property',
        address: '100 First St, Nairobi',
        type: 'apartment',
        units: 10,
        monthlyRent: 50000
      })
      .expect(201);

    const property1Id = property1Response.body._id;

    // 3. Create second property
    await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        name: 'Second Property',
        address: '200 Second St, Nairobi',
        type: 'house',
        units: 5,
        monthlyRent: 75000
      })
      .expect(201);

    // 4. View all properties
    const propertiesResponse = await request(app)
      .get('/api/v1/properties/landlord')
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(propertiesResponse.body.length).toBe(2);

    // 5. Update property
    await request(app)
      .put(`/api/v1/properties/${property1Id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        name: 'Updated First Property',
        monthlyRent: 55000
      })
      .expect(200);

    // 6. Update rent
    await request(app)
      .put(`/api/v1/properties/${property1Id}/rent`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({ amount: 60000 })
      .expect(200);

    // 7. Create vendor
    const vendorResponse = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        name: 'Quick Fix Services',
        serviceTypes: ['plumbing', 'electrical'],
        phone: '+254722333444',
        email: 'quickfix@vendor.com'
      })
      .expect(201);

    expect(vendorResponse.body.name).toBe('Quick Fix Services');

    // 8. View vendors
    const vendorsResponse = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(vendorsResponse.body.length).toBe(1);
  });

  it('should complete landlord tenant management workflow', async () => {
    // Complete workflow: Create Property → Tenant Applies → Manage Maintenance
    
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    const tenant = await e2eUtils.completeUserOnboarding(app, request, 'tenant');

    // 1. Create property
    const property = await e2eUtils.propertyApplicationFlow(
      app,
      request,
      landlord.token,
      tenant.token
    );

    // 2. Tenant submits maintenance
    await request(app)
      .post('/api/v1/tenant/maintenance')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        title: 'Broken Door',
        description: 'Front door lock is broken',
        category: 'general',
        priority: 'high',
        propertyId: property._id
      })
      .expect(201);

    // 3. Landlord views maintenance requests
    const maintenanceResponse = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(Array.isArray(maintenanceResponse.body)).toBe(true);

    // 4. Landlord filters by property
    const filteredResponse = await request(app)
      .get(`/api/v1/maintenance?propertyId=${property._id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(Array.isArray(filteredResponse.body)).toBe(true);
  });
});
