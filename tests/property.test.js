const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Property = require('../models/property.model');
const { makeUser, makeProperty } = require('./helpers/factories');

// models-as-truth: Property uses title/description(50+)/type(enum)/bedrooms/
// bathrooms/address{street,area,city,county,coordinates}/rent.amount/deposit.
// List endpoints return { count, properties }. Rent updates are capped at a
// 7% increase (Kenyan law); deposit can't exceed 3x rent. Delete returns
// { message }. Create returns the raw property.

let mongoServer, landlordToken, landlordId, tenantToken;

// A valid create/update body (no landlord — the controller sets it).
const validBody = (over = {}) => ({
  title: 'New Property',
  description: 'A spacious modern apartment located in Riverside, Nairobi, Kenya.',
  type: 'apartment',
  bedrooms: 3,
  bathrooms: 2,
  address: { street: 'New St', area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.81, -1.28] } },
  rent: { amount: 55000 },
  deposit: 55000,
  subcounty: 'Westlands',
  ...over
});

describe('Property Controller Tests', () => {
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
    const landlord = await makeUser('landlord');
    const tenant = await makeUser('tenant');
    landlordToken = landlord.token; landlordId = landlord.user._id;
    tenantToken = tenant.token;
  });

  describe('GET /api/v1/properties', () => {
    beforeEach(async () => {
      await makeProperty(landlordId, { title: 'Property 1' });
      await makeProperty(landlordId, { title: 'Property 2', type: 'house' });
    });

    it('should list properties (public)', async () => {
      const response = await request(app).get('/api/v1/properties').expect(200);
      expect(Array.isArray(response.body.properties)).toBe(true);
      expect(response.body.properties.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/properties/:id', () => {
    let id;
    beforeEach(async () => { id = (await makeProperty(landlordId, { title: 'Test Property' }))._id; });

    it('should get property by id (public)', async () => {
      const response = await request(app).get(`/api/v1/properties/${id}`).expect(200);
      expect(response.body).toHaveProperty('title', 'Test Property');
      expect(response.body).toHaveProperty('type', 'apartment');
      expect(response.body).toHaveProperty('address');
    });

    it('should return 404 for non-existent property', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app).get(`/api/v1/properties/${fakeId}`).expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/properties', () => {
    it('should create property as landlord', async () => {
      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${landlordToken}`)
        .send(validBody())
        .expect(201);
      expect(response.body).toHaveProperty('title', 'New Property');
      expect(response.body).toHaveProperty('landlord');
    });

    it('should create property without address.coordinates', async () => {
      // Regression: the schema used to default coordinates.type to 'Point'
      // with no coordinates array, which passed validation but was rejected
      // by the 2dsphere index at insert time (500 in production).
      const body = validBody();
      delete body.address.coordinates;
      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${landlordToken}`)
        .send(body)
        .expect(201);
      expect(response.body).toHaveProperty('title', 'New Property');
      expect(response.body.address.coordinates).toBeUndefined();
    });

    it('should reject deposit exceeding 3x rent', async () => {
      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${landlordToken}`)
        .send(validBody({ deposit: 200000 })) // > 3 x 55000
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject property creation by tenant', async () => {
      const response = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(validBody())
        .expect(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject property creation without authentication', async () => {
      const response = await request(app).post('/api/v1/properties').send(validBody()).expect(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/properties/:id', () => {
    let id;
    beforeEach(async () => { id = (await makeProperty(landlordId, { title: 'Update Test' }))._id; });

    it('should update own property as landlord', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${id}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({ title: 'Updated Property Name' })
        .expect(200);
      expect(response.body).toHaveProperty('title', 'Updated Property Name');
    });

    it('should not update property of another landlord', async () => {
      const other = await makeUser('landlord');
      const response = await request(app)
        .put(`/api/v1/properties/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Hacked' })
        .expect(403);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/properties/:id', () => {
    let id;
    beforeEach(async () => { id = (await makeProperty(landlordId, { title: 'Delete Test' }))._id; });

    it('should delete own property as landlord', async () => {
      const response = await request(app)
        .delete(`/api/v1/properties/${id}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);
      expect(response.body).toHaveProperty('message');
      expect(await Property.findById(id)).toBeNull();
    });

    it('should not delete property as tenant', async () => {
      const response = await request(app)
        .delete(`/api/v1/properties/${id}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(403);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/properties/available', () => {
    beforeEach(async () => {
      await makeProperty(landlordId, { title: 'Available 1', status: 'available' });
      await makeProperty(landlordId, { title: 'Available 2', status: 'available' });
    });

    it('should get available properties', async () => {
      const response = await request(app).get('/api/v1/properties/available').expect(200);
      expect(Array.isArray(response.body.properties)).toBe(true);
      expect(response.body.properties.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/properties/landlord', () => {
    beforeEach(async () => {
      await makeProperty(landlordId, { title: 'Landlord 1' });
      await makeProperty(landlordId, { title: 'Landlord 2' });
    });

    it('should get landlord properties', async () => {
      const response = await request(app)
        .get('/api/v1/properties/landlord')
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);
      expect(Array.isArray(response.body.properties)).toBe(true);
      expect(response.body.properties.length).toBe(2);
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
    let id;
    beforeEach(async () => { id = (await makeProperty(landlordId, { rent: { amount: 45000 } }))._id; });

    it('should update rent within the 7% cap', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${id}/rent`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({ amount: 48000 }) // +6.7%, within cap
        .expect(200);
      expect(response.body.property.rent.amount).toBe(48000);
    });

    it('should reject a rent increase above the 7% cap', async () => {
      const response = await request(app)
        .put(`/api/v1/properties/${id}/rent`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({ amount: 60000 }) // +33%, illegal
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
