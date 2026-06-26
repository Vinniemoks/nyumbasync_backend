const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Maintenance = require('../models/maintenance.model');
const Property = require('../models/property.model');
const { makeUser, makeProperty } = require('./helpers/factories');

// models-as-truth: Maintenance model has property/reportedBy (req refs), issueType
// (enum: plumbing/electrical/structural/security/water/other), description,
// status (enum: reported/assigned/in_progress/completed), priority. The
// tenant-facing controller maps to a ticketNumber (TKT-<id>) + category shape.

let mongoServer;
let tenantToken, tenantId, landlordToken, landlordId, propertyId;

const seedRequest = (over = {}) => Maintenance.create({
  property: propertyId,
  reportedBy: tenantId,
  issueType: 'plumbing',
  description: 'Leaking faucet',
  status: 'reported',
  ...over
});

describe('Maintenance Controller Tests', () => {
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
    await Maintenance.deleteMany({});
    await Property.deleteMany({});
    const tenant = await makeUser('tenant');
    const landlord = await makeUser('landlord');
    tenantToken = tenant.token; tenantId = tenant.user._id;
    landlordToken = landlord.token; landlordId = landlord.user._id;
    const property = await makeProperty(landlordId);
    propertyId = property._id;
  });

  describe('GET /api/v1/tenant/maintenance', () => {
    beforeEach(async () => {
      await seedRequest({ issueType: 'plumbing', status: 'reported' });
      await seedRequest({ issueType: 'electrical', status: 'assigned' });
    });

    it('should get tenant maintenance requests', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('ticketNumber');
      expect(response.body[0]).toHaveProperty('status');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app).get('/api/v1/tenant/maintenance').expect(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/maintenance/:id', () => {
    let id;
    beforeEach(async () => {
      const m = await seedRequest({ description: 'Leaking pipe', status: 'assigned', priority: 'high' });
      id = m._id;
    });

    it('should get specific maintenance request', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/maintenance/${id}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('ticketNumber');
      expect(response.body).toHaveProperty('description', 'Leaking pipe');
      expect(response.body).toHaveProperty('priority', 'high');
    });

    it('should return 404 for non-existent request', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/tenant/maintenance/${fakeId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should not get maintenance request of another tenant', async () => {
      const other = await makeUser('tenant');
      const response = await request(app)
        .get(`/api/v1/tenant/maintenance/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tenant/maintenance', () => {
    it('should create maintenance request', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ title: 'Broken Window', description: 'Window in bedroom is broken', category: 'structural', priority: 'medium', propertyId })
        .expect(201);

      expect(response.body).toHaveProperty('ticketNumber');
      expect(response.body).toHaveProperty('status', 'reported');
      expect(response.body.description).toBe('Window in bedroom is broken');
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ title: 'Test' }) // no propertyId / description
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .send({ description: 'Test', category: 'plumbing', propertyId })
        .expect(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/tenant/maintenance/:id', () => {
    let id;
    beforeEach(async () => {
      const m = await seedRequest({ description: 'Original description', status: 'reported' });
      id = m._id;
    });

    it('should update maintenance request status', async () => {
      const response = await request(app)
        .put(`/api/v1/tenant/maintenance/${id}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ status: 'completed', note: 'Resolved' })
        .expect(200);
      expect(response.body.status).toBe('completed');
    });

    it('should not update request of another tenant', async () => {
      const other = await makeUser('tenant');
      const response = await request(app)
        .put(`/api/v1/tenant/maintenance/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ status: 'completed' })
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tenant/maintenance/:id/rate', () => {
    let id;
    beforeEach(async () => {
      const m = await seedRequest({ description: 'Fixed issue', status: 'completed' });
      id = m._id;
    });

    it('should rate completed maintenance request', async () => {
      const response = await request(app)
        .post(`/api/v1/tenant/maintenance/${id}/rate`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ rating: 5, feedback: 'Excellent service!' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/v1/maintenance/property/:id (landlord)', () => {
    it('should return property maintenance requests as an array', async () => {
      const response = await request(app)
        .get(`/api/v1/maintenance/property/${propertyId}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
