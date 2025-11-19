const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Maintenance = require('../models/maintenance.model');
const Property = require('../models/property.model');

let mongoServer;
let tenantToken, landlordToken;
let tenantId, landlordId, propertyId;

describe('Maintenance Controller Tests', () => {
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
    await Maintenance.deleteMany({});
    await Property.deleteMany({});

    // Create tenant
    const tenantResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'tenant@example.com',
        password: 'Test123!',
        firstName: 'Ten',
        lastName: 'Ant',
        phone: '254712345678',
        role: 'tenant'
      });

    tenantToken = tenantResponse.body.token;
    tenantId = tenantResponse.body.user.id;

    // Create landlord
    const landlordResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'landlord@example.com',
        password: 'Test123!',
        firstName: 'Land',
        lastName: 'Lord',
        phone: '254712345679',
        role: 'landlord'
      });

    landlordToken = landlordResponse.body.token;
    landlordId = landlordResponse.body.user.id;

    // Create property
    const property = await Property.create({
      name: 'Test Property',
      address: '123 Test St, Nairobi',
      type: 'apartment',
      units: 10,
      monthlyRent: 50000,
      landlord: landlordId
    });
    propertyId = property._id;
  });

  describe('GET /api/v1/tenant/maintenance', () => {
    beforeEach(async () => {
      await Maintenance.create([
        {
          property: propertyId,
          reportedBy: tenantId,
          issueType: 'plumbing',
          description: 'Leaking faucet',
          status: 'submitted',
          ticketNumber: 'TKT-001'
        },
        {
          property: propertyId,
          reportedBy: tenantId,
          issueType: 'electrical',
          description: 'Broken light',
          status: 'assigned',
          ticketNumber: 'TKT-002'
        }
      ]);
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
      const response = await request(app)
        .get('/api/v1/tenant/maintenance')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/maintenance/:id', () => {
    let maintenanceId;

    beforeEach(async () => {
      const maintenance = await Maintenance.create({
        property: propertyId,
        reportedBy: tenantId,
        issueType: 'plumbing',
        description: 'Leaking pipe',
        status: 'assigned',
        ticketNumber: 'TKT-003',
        priority: 'high'
      });
      maintenanceId = maintenance._id;
    });

    it('should get specific maintenance request', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('ticketNumber', 'TKT-003');
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
      // Create another tenant
      const otherTenantResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'other@example.com',
          password: 'Test123!',
          firstName: 'Other',
          lastName: 'Tenant',
          phone: '254712345680',
          role: 'tenant'
        });

      const response = await request(app)
        .get(`/api/v1/tenant/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${otherTenantResponse.body.token}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tenant/maintenance', () => {
    it('should create maintenance request', async () => {
      const maintenanceData = {
        title: 'Broken Window',
        description: 'Window in bedroom is broken',
        category: 'general',
        priority: 'medium',
        propertyId: propertyId
      };

      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(maintenanceData)
        .expect(201);

      expect(response.body).toHaveProperty('ticketNumber');
      expect(response.body).toHaveProperty('status', 'submitted');
      expect(response.body.description).toBe(maintenanceData.description);
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          title: 'Test'
          // Missing description, category, propertyId
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/maintenance')
        .send({
          title: 'Test',
          description: 'Test',
          category: 'plumbing',
          propertyId: propertyId
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/tenant/maintenance/:id', () => {
    let maintenanceId;

    beforeEach(async () => {
      const maintenance = await Maintenance.create({
        property: propertyId,
        reportedBy: tenantId,
        issueType: 'plumbing',
        description: 'Original description',
        status: 'submitted',
        ticketNumber: 'TKT-004'
      });
      maintenanceId = maintenance._id;
    });

    it('should update maintenance request', async () => {
      const response = await request(app)
        .put(`/api/v1/tenant/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          status: 'cancelled',
          note: 'Issue resolved by myself'
        })
        .expect(200);

      expect(response.body.status).toBe('cancelled');
    });

    it('should not update request of another tenant', async () => {
      const otherTenantResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'other2@example.com',
          password: 'Test123!',
          firstName: 'Other',
          lastName: 'Tenant',
          phone: '254712345681',
          role: 'tenant'
        });

      const response = await request(app)
        .put(`/api/v1/tenant/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${otherTenantResponse.body.token}`)
        .send({ status: 'cancelled' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tenant/maintenance/:id/rate', () => {
    let maintenanceId;

    beforeEach(async () => {
      const maintenance = await Maintenance.create({
        property: propertyId,
        reportedBy: tenantId,
        issueType: 'plumbing',
        description: 'Fixed issue',
        status: 'completed',
        ticketNumber: 'TKT-005'
      });
      maintenanceId = maintenance._id;
    });

    it('should rate completed maintenance request', async () => {
      const response = await request(app)
        .post(`/api/v1/tenant/maintenance/${maintenanceId}/rate`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          rating: 5,
          feedback: 'Excellent service!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid rating', async () => {
      const response = await request(app)
        .post(`/api/v1/tenant/maintenance/${maintenanceId}/rate`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          rating: 10, // Invalid rating (should be 1-5)
          feedback: 'Test'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/maintenance', () => {
    beforeEach(async () => {
      await Maintenance.create([
        {
          property: propertyId,
          reportedBy: tenantId,
          issueType: 'plumbing',
          description: 'Request 1',
          status: 'submitted',
          ticketNumber: 'TKT-006'
        },
        {
          property: propertyId,
          reportedBy: tenantId,
          issueType: 'electrical',
          description: 'Request 2',
          status: 'in_progress',
          ticketNumber: 'TKT-007'
        }
      ]);
    });

    it('should get all maintenance requests (landlord)', async () => {
      const response = await request(app)
        .get('/api/v1/maintenance')
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/maintenance?status=submitted')
        .set('Authorization', `Bearer ${landlordToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0].status).toBe('submitted');
      }
    });
  });
});
