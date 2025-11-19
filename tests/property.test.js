const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Property = require('../models/property.model');

let mongoServer;
let landlordToken, tenantToken;
let landlordId, tenantId;

describe('Property Controller Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});

    // Create landlord
    const landlordResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'landlord@example.com',
        password: 'Test123!',
        firstName: 'Land',
        lastName: 'Lord',
        phone: '254712345678',
        role: 'landlord'
      });

    landlordToken = landlordResponse.body.token;
    landlordId = landlordResponse.body.user.id;

    // Create tenant
    const tenantResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'tenant@example.com',
        password: 'Test123!',
        firstName: 'Ten',
        lastName: 'Ant',
        phone: '254712345679',
        role: 'tenant'
      });

    tenantToken = tenantResponse.body.token;
    tenantId = tenantResponse.body.user.id;
  });

  describe('GET /api/v1/properties', () => {
    beforeEach(async () => {
      await Property.create([
        {
          name: 'Property 1',
          address: '123 Test St, Nairobi',
          type: 'apartment',
          units: 10,
          monthlyRent: 50000,
          landlord: landlordId
        },
        {
          name: 'Property 2',
          address: '456 Test Ave, Nairobi',
          type: 'house',
          units: 5,
          monthlyRent: 75000,
          landlord: landlordId
        }
      ]);
    });

    it('should get all properties', async () => {
      const response = await request(app)
        .get('/api/v1/properties')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should get properties without authentication (public)', async () => {
      const response = await request(app)
        .get('/api/v1/properties')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/v1/properties/:id', () => {
    let propertyId;

    beforeEach(async () => {
      const property = await Property.create({
        name: 'Test Property',
        address: '789 Test Rd, Nairobi',
        type: 'apartment',
        units: 8,
        monthlyRent: 60000,
        landlord: landlordId,
        bedrooms: 2,
        bathrooms: 2,
        amenities: ['Parking', 'Security']
      });
      propertyId = property._id;
    });

    it('should get property by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/properties/${propertyId}`)
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Test Property');
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('type', 'apartment');
    });

    it('should return 404 for non-existent property', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/properties/${fakeId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/properties', () => {
    it('should create property as landlord', async () => {
      const propertyData = {
        name: 'New Property',
        address: '999 New St, Nairobi',
        type: 'apartment',
        units: 12,
        monthlyRent: 55000,
        bedrooms: 3,
        bathrooms: 2
      };

      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${landlordToken}`)
        .send(propertyData)
        .expect(201);

      expect(response.body).toHaveProperty('name', 'New Property');
      expect(response.body).toHaveProperty('landlord');
    });

    it('should reject property creation by tenant', async () => {
      const propertyData = {
        name: 'Tenant Property',
        address: '111 Tenant St, Nairobi',
        type: 'house',
        units: 1,
        monthlyRent: 40000
      };

      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(propertyData)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject property creation without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/properties')
        .send({ name: 'Test' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/properties/:id', () => {
    let propertyId;

    beforeEach(async () => {
      const property = await Property.create({
        name: 'Update Test Property',
        address: '222 Update St, Nairobi',
        type: 'apartment',
        units: 6,
        monthlyRent: 45000,
        landlord: landlordId
      });
      propertyId = property._id;
    });

    it('should update own property as landlord', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({
          name: 'Updated Property Name',
          monthlyRent: 50000
        })
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Updated Property Name');
      expect(response.body.monthlyRent).toBe(50000);
    });

    it('should not update property of another landlord', async () => {
      // Create another landlord
      const otherLandlordResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'other@example.com',
          password: 'Test123!',
          firstName: 'Other',
          lastName: 'Landlord',
          phone: '254712345680',
          role: 'landlord'
        });

      const response = await request(app)
        .put(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${otherLandlordResponse.body.token}`)
        .send({ name: 'Hacked Name' })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/properties/:id', () => {
    let propertyId;

    beforeEach(async () => {
      const property = await Property.create({
        name: 'Delete Test Property',
        address: '333 Delete St, Nairobi',
        type: 'house',
        units: 1,
        monthlyRent: 80000,
        landlord: landlordId
      });
      propertyId = property._id;
    });

    it('should delete own property as landlord', async () => {
      const response = await request(app)
        .delete(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify property is deleted
      const property = await Property.findById(propertyId);
      expect(property).toBeNull();
    });

    it('should not delete property as tenant', async () => {
      const response = await request(app)
        .delete(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/properties/available', () => {
    beforeEach(async () => {
      await Property.create([
        {
          name: 'Available Property 1',
          address: '444 Available St, Nairobi',
          type: 'apartment',
          units: 10,
          occupied: 5,
          monthlyRent: 50000,
          landlord: landlordId,
          status: 'available'
        },
        {
          name: 'Available Property 2',
          address: '555 Available Ave, Nairobi',
          type: 'house',
          units: 3,
          occupied: 0,
          monthlyRent: 70000,
          landlord: landlordId,
          status: 'available'
        }
      ]);
    });

    it('should get available properties', async () => {
      const response = await request(app)
        .get('/api/v1/properties/available')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/properties/landlord', () => {
    beforeEach(async () => {
      await Property.create([
        {
          name: 'Landlord Property 1',
          address: '666 Landlord St, Nairobi',
          type: 'apartment',
          units: 8,
          monthlyRent: 55000,
          landlord: landlordId
        },
        {
          name: 'Landlord Property 2',
          address: '777 Landlord Ave, Nairobi',
          type: 'house',
          units: 2,
          monthlyRent: 90000,
          landlord: landlordId
        }
      ]);
    });

    it('should get landlord properties', async () => {
      const response = await request(app)
        .get('/api/v1/properties/landlord')
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should reject request from non-landlord', async () => {
      const response = await request(app)
        .get('/api/v1/properties/landlord')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/properties/:id/rent', () => {
    let propertyId;

    beforeEach(async () => {
      const property = await Property.create({
        name: 'Rent Update Property',
        address: '888 Rent St, Nairobi',
        type: 'apartment',
        units: 5,
        monthlyRent: 45000,
        landlord: landlordId
      });
      propertyId = property._id;
    });

    it('should update property rent as landlord', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${propertyId}/rent`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({ amount: 50000 })
        .expect(200);

      expect(response.body.monthlyRent).toBe(50000);
    });

    it('should reject invalid rent amount', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${propertyId}/rent`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({ amount: 500 }) // Too low
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
