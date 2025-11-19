const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const MoveOutRequest = require('../models/move-out-request.model');
const DepositRefund = require('../models/deposit-refund.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');

let mongoServer;
let tenantToken, tenantId;
let propertyId, leaseId;

describe('Move-Out and Deposit Tests', () => {
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
    await MoveOutRequest.deleteMany({});
    await DepositRefund.deleteMany({});
    await Property.deleteMany({});
    await Lease.deleteMany({});

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

    // Create property
    const property = await Property.create({
      name: 'Test Property',
      address: '123 Test St, Nairobi',
      type: 'apartment',
      units: 10,
      monthlyRent: 50000
    });
    propertyId = property._id;

    // Create lease
    const lease = await Lease.create({
      tenant: tenantId,
      property: propertyId,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-01-01'),
      monthlyRent: 50000,
      securityDeposit: 50000,
      status: 'active'
    });
    leaseId = lease._id;
  });

  describe('POST /api/v1/tenant/move-out/request', () => {
    it('should submit move-out request', async () => {
      const moveOutData = {
        propertyId: propertyId,
        leaseId: leaseId,
        moveOutDate: '2024-12-31',
        reason: 'Relocating to another city',
        forwardingAddress: '456 New St, Mombasa'
      };

      const response = await request(app)
        .post('/api/v1/tenant/move-out/request')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(moveOutData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('referenceNumber');
      expect(response.body.moveOutRequest).toHaveProperty('status', 'pending');
      expect(response.body.moveOutRequest.reason).toBe(moveOutData.reason);
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/move-out/request')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          propertyId: propertyId
          // Missing leaseId, moveOutDate, reason
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tenant/move-out/request')
        .send({
          propertyId: propertyId,
          leaseId: leaseId,
          moveOutDate: '2024-12-31',
          reason: 'Test'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/move-out/status/:requestId', () => {
    let moveOutRequestId;

    beforeEach(async () => {
      const moveOutRequest = await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'Relocating',
        status: 'approved',
        referenceNumber: 'MO-TEST-001'
      });
      moveOutRequestId = moveOutRequest._id;
    });

    it('should get move-out request status', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/move-out/status/${moveOutRequestId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('referenceNumber', 'MO-TEST-001');
      expect(response.body).toHaveProperty('status', 'approved');
    });

    it('should return 404 for non-existent request', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/tenant/move-out/status/${fakeId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/move-out/current', () => {
    it('should get current move-out request', async () => {
      await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'Current request',
        status: 'pending',
        referenceNumber: 'MO-CURRENT-001'
      });

      const response = await request(app)
        .get('/api/v1/tenant/move-out/current')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('referenceNumber', 'MO-CURRENT-001');
      expect(response.body).toHaveProperty('status', 'pending');
    });

    it('should return null when no current request', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/move-out/current')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toBeNull();
    });
  });

  describe('DELETE /api/v1/tenant/move-out/request/:requestId', () => {
    let moveOutRequestId;

    beforeEach(async () => {
      const moveOutRequest = await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'To cancel',
        status: 'pending',
        referenceNumber: 'MO-CANCEL-001'
      });
      moveOutRequestId = moveOutRequest._id;
    });

    it('should cancel move-out request', async () => {
      const response = await request(app)
        .delete(`/api/v1/tenant/move-out/request/${moveOutRequestId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/tenant/deposit/refund', () => {
    let moveOutRequestId;

    beforeEach(async () => {
      const moveOutRequest = await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'Relocating',
        status: 'approved',
        referenceNumber: 'MO-DEPOSIT-001'
      });
      moveOutRequestId = moveOutRequest._id;
    });

    it('should request deposit refund', async () => {
      const refundData = {
        moveOutRequestId: moveOutRequestId,
        depositAmount: 50000,
        bankDetails: {
          accountNumber: '1234567890',
          bankName: 'KCB Bank',
          accountName: 'Ten Ant'
        }
      };

      const response = await request(app)
        .post('/api/v1/tenant/deposit/refund')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(refundData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.refundRequest).toHaveProperty('status', 'submitted');
      expect(response.body.refundRequest.depositAmount).toBe(50000);
    });

    it('should reject duplicate refund request', async () => {
      // Create first refund request
      await DepositRefund.create({
        moveOutRequest: moveOutRequestId,
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        depositAmount: 50000,
        refundAmount: 50000,
        bankDetails: {
          accountNumber: '1234567890',
          bankName: 'KCB Bank',
          accountName: 'Ten Ant'
        }
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/tenant/deposit/refund')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          moveOutRequestId: moveOutRequestId,
          depositAmount: 50000,
          bankDetails: {
            accountNumber: '1234567890',
            bankName: 'KCB Bank',
            accountName: 'Ten Ant'
          }
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request for non-existent move-out', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/v1/tenant/deposit/refund')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          moveOutRequestId: fakeId,
          depositAmount: 50000,
          bankDetails: {
            accountNumber: '1234567890',
            bankName: 'KCB Bank',
            accountName: 'Ten Ant'
          }
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/deposit/status/:refundId', () => {
    let refundId, moveOutRequestId;

    beforeEach(async () => {
      const moveOutRequest = await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'Relocating',
        status: 'approved'
      });
      moveOutRequestId = moveOutRequest._id;

      const refund = await DepositRefund.create({
        moveOutRequest: moveOutRequestId,
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        depositAmount: 50000,
        refundAmount: 45000,
        status: 'approved',
        bankDetails: {
          accountNumber: '1234567890',
          bankName: 'KCB Bank',
          accountName: 'Ten Ant'
        },
        deductions: [
          {
            description: 'Carpet cleaning',
            amount: 5000,
            category: 'cleaning'
          }
        ]
      });
      refundId = refund._id;
    });

    it('should get deposit refund status', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/deposit/status/${refundId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'approved');
      expect(response.body.depositAmount).toBe(50000);
      expect(response.body.refundAmount).toBe(45000);
      expect(response.body.deductions).toHaveLength(1);
    });

    it('should return 404 for non-existent refund', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/tenant/deposit/status/${fakeId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/tenant/deposit/current', () => {
    it('should get current deposit refund', async () => {
      const moveOutRequest = await MoveOutRequest.create({
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        moveOutDate: new Date('2024-12-31'),
        reason: 'Relocating',
        status: 'approved'
      });

      await DepositRefund.create({
        moveOutRequest: moveOutRequest._id,
        tenant: tenantId,
        property: propertyId,
        lease: leaseId,
        depositAmount: 50000,
        refundAmount: 50000,
        status: 'submitted',
        bankDetails: {
          accountNumber: '1234567890',
          bankName: 'KCB Bank',
          accountName: 'Ten Ant'
        }
      });

      const response = await request(app)
        .get('/api/v1/tenant/deposit/current')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'submitted');
      expect(response.body.depositAmount).toBe(50000);
    });

    it('should return null when no current refund', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/deposit/current')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(response.body).toBeNull();
    });
  });
});
