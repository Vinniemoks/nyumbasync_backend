const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Vendor = require('../models/vendor.model');

let mongoServer;
let landlordToken, tenantToken, adminToken;
let landlordId, tenantId, adminId;

describe('Vendor Controller Tests', () => {
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
    await Vendor.deleteMany({});

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

    // Create admin
    const adminResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'admin@example.com',
        password: 'Test123!',
        firstName: 'Ad',
        lastName: 'Min',
        phone: '254712345680',
        role: 'admin'
      });

    adminToken = adminResponse.body.token;
    adminId = adminResponse.body.user.id;
  });

  describe('GET /api/v1/vendors', () => {
    beforeEach(async () => {
      await Vendor.create([
        {
          name: "John's Plumbing",
          serviceTypes: ['plumbing'],
          phone: '+254722111222',
          email: 'john@plumbing.com',
          rating: 4.5,
          availability: 'available'
        },
        {
          name: "Jane's Electrical",
          serviceTypes: ['electrical'],
          phone: '+254722111223',
          email: 'jane@electrical.com',
          rating: 4.8,
          availability: 'available'
        }
      ]);
    });

    it('should get all vendors', async () => {
      const response = await request(app)
        .get('/api/v1/vendors')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('serviceTypes');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/vendors')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Bob's Carpentry",
        serviceTypes: ['carpentry', 'general'],
        phone: '+254722111224',
        email: 'bob@carpentry.com',
        rating: 4.7,
        availability: 'available',
        description: 'Professional carpentry services',
        yearsOfExperience: 10,
        certifications: ['Licensed Carpenter']
      });
      vendorId = vendor._id;
    });

    it('should get vendor by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('name', "Bob's Carpentry");
      expect(response.body).toHaveProperty('rating', 4.7);
      expect(response.body).toHaveProperty('yearsOfExperience', 10);
    });

    it('should return 404 for non-existent vendor', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/vendors/${fakeId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/vendors', () => {
    it('should create vendor as landlord', async () => {
      const vendorData = {
        name: "New Vendor Services",
        serviceTypes: ['plumbing', 'electrical'],
        phone: '+254722111225',
        email: 'new@vendor.com',
        description: 'Multi-service vendor',
        yearsOfExperience: 5
      };

      const response = await request(app)
        .post('/api/v1/vendors')
        .set('Authorization', `Bearer ${landlordToken}`)
        .send(vendorData)
        .expect(201);

      expect(response.body).toHaveProperty('name', vendorData.name);
      expect(response.body.serviceTypes).toEqual(vendorData.serviceTypes);
    });

    it('should create vendor as admin', async () => {
      const vendorData = {
        name: "Admin Vendor",
        serviceTypes: ['general'],
        phone: '+254722111226',
        email: 'admin@vendor.com'
      };

      const response = await request(app)
        .post('/api/v1/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(vendorData)
        .expect(201);

      expect(response.body).toHaveProperty('name', vendorData.name);
    });

    it('should reject vendor creation by tenant', async () => {
      const response = await request(app)
        .post('/api/v1/vendors')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          name: "Tenant Vendor",
          serviceTypes: ['plumbing'],
          phone: '+254722111227',
          email: 'tenant@vendor.com'
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Update Test Vendor",
        serviceTypes: ['plumbing'],
        phone: '+254722111228',
        email: 'update@vendor.com',
        rating: 4.0
      });
      vendorId = vendor._id;
    });

    it('should update vendor as landlord', async () => {
      const response = await request(app)
        .put(`/api/v1/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${landlordToken}`)
        .send({
          name: "Updated Vendor Name",
          rating: 4.5
        })
        .expect(200);

      expect(response.body).toHaveProperty('name', "Updated Vendor Name");
      expect(response.body.rating).toBe(4.5);
    });

    it('should reject update by tenant', async () => {
      const response = await request(app)
        .put(`/api/v1/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ name: "Hacked Name" })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Delete Test Vendor",
        serviceTypes: ['general'],
        phone: '+254722111229',
        email: 'delete@vendor.com'
      });
      vendorId = vendor._id;
    });

    it('should delete vendor as admin', async () => {
      const response = await request(app)
        .delete(`/api/v1/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify vendor is deleted
      const vendor = await Vendor.findById(vendorId);
      expect(vendor).toBeNull();
    });

    it('should reject deletion by tenant', async () => {
      const response = await request(app)
        .delete(`/api/v1/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/vendors', () => {
    beforeEach(async () => {
      await Vendor.create([
        {
          name: "Plumber 1",
          serviceTypes: ['plumbing'],
          phone: '+254722111230',
          email: 'plumber1@vendor.com',
          rating: 4.5,
          availability: 'available'
        },
        {
          name: "Plumber 2",
          serviceTypes: ['plumbing'],
          phone: '+254722111231',
          email: 'plumber2@vendor.com',
          rating: 4.8,
          availability: 'available'
        },
        {
          name: "Electrician 1",
          serviceTypes: ['electrical'],
          phone: '+254722111232',
          email: 'electrician@vendor.com',
          rating: 4.2,
          availability: 'busy'
        }
      ]);
    });

    it('should get vendors for tenant', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/vendors')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should filter by service type', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/vendors?serviceTypes=plumbing')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      response.body.forEach(vendor => {
        expect(vendor.serviceTypes).toContain('plumbing');
      });
    });

    it('should filter by minimum rating', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/vendors?minRating=4.5')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(vendor => {
        expect(vendor.rating).toBeGreaterThanOrEqual(4.5);
      });
    });

    it('should filter by availability', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/vendors?availability=available')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(vendor => {
        expect(vendor.availability).toBe('available');
      });
    });
  });

  describe('GET /api/v1/tenant/vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Detailed Vendor",
        serviceTypes: ['plumbing', 'drainage'],
        phone: '+254722111233',
        email: 'detailed@vendor.com',
        rating: 4.6,
        availability: 'available',
        description: 'Professional plumbing services',
        yearsOfExperience: 12,
        certifications: ['Licensed Plumber', 'Certified Drainage Expert'],
        reviews: [
          {
            rating: 5,
            comment: 'Excellent service',
            date: new Date('2024-01-01')
          }
        ]
      });
      vendorId = vendor._id;
    });

    it('should get detailed vendor information', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Detailed Vendor');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('yearsOfExperience', 12);
      expect(response.body.certifications).toHaveLength(2);
      expect(response.body.reviews).toHaveLength(1);
    });
  });

  describe('POST /api/v1/tenant/vendors/:vendorId/contact', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Contact Vendor",
        serviceTypes: ['plumbing'],
        phone: '+254722111234',
        email: 'contact@vendor.com'
      });
      vendorId = vendor._id;
    });

    it('should contact vendor', async () => {
      const response = await request(app)
        .post(`/api/v1/tenant/vendors/${vendorId}/contact`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          message: 'I need plumbing services urgently'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/tenant/vendors/:vendorId/request', () => {
    let vendorId;

    beforeEach(async () => {
      const vendor = await Vendor.create({
        name: "Request Vendor",
        serviceTypes: ['plumbing'],
        phone: '+254722111235',
        email: 'request@vendor.com'
      });
      vendorId = vendor._id;
    });

    it('should request service from vendor', async () => {
      const requestData = {
        serviceType: 'plumbing',
        description: 'Leaking faucet repair',
        preferredDate: '2024-12-25',
        urgency: 'normal'
      };

      const response = await request(app)
        .post(`/api/v1/tenant/vendors/${vendorId}/request`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(requestData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('message');
    });
  });
});
