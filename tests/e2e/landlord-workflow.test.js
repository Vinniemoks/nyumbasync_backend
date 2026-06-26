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

    // Helper: a valid Property body for the real schema.
    const propertyBody = (over = {}) => ({
      title: 'First Property',
      description: 'A spacious property located in the Riverside area of Nairobi, Kenya, for testing.',
      type: 'apartment',
      bedrooms: 3,
      bathrooms: 2,
      address: { street: '100 First St', area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
      rent: { amount: 50000 },
      deposit: 50000,
      subcounty: 'Westlands',
      ...over
    });

    // 2. Create first property
    const property1Response = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send(propertyBody())
      .expect(201);

    const property1Id = property1Response.body._id;

    // 3. Create second property
    await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send(propertyBody({ title: 'Second Property', type: 'house', rent: { amount: 75000 }, deposit: 75000 }))
      .expect(201);

    // 4. View all properties (landlord list returns { count, properties })
    const propertiesResponse = await request(app)
      .get('/api/v1/properties/landlord')
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(propertiesResponse.body.properties.length).toBe(2);

    // 5. Update property
    await request(app)
      .put(`/api/v1/properties/${property1Id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({ title: 'Updated First Property' })
      .expect(200);

    // 6. Update rent — must stay within the 7% legal cap (50000 → 53000)
    await request(app)
      .put(`/api/v1/properties/${property1Id}/rent`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({ amount: 53000 })
      .expect(200);

    // 7. Create vendor (real schema: company/contact/services/subcounties)
    const vendorResponse = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        company: 'Quick Fix Services',
        contact: '254722333444',
        services: ['plumbing', 'electrical'],
        subcounties: ['Westlands']
      })
      .expect(201);

    expect(vendorResponse.body.company).toBe('Quick Fix Services');

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
        category: 'structural',
        priority: 'high',
        propertyId: property._id
      })
      .expect(201);

    // 3. Landlord views maintenance requests for the property
    const maintenanceResponse = await request(app)
      .get(`/api/v1/maintenance/property/${property._id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(Array.isArray(maintenanceResponse.body)).toBe(true);
  });
});
