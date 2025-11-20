const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Maintenance = require('../../models/maintenance.model');
const Document = require('../../models/document.model');
const Notification = require('../../models/notification.model');

require('./setup');

let mongoServer;

describe('Integration: Complete User Journey', () => {
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
    await Maintenance.deleteMany({});
    await Document.deleteMany({});
    await Notification.deleteMany({});
  });

  describe('Tenant Complete Journey', () => {
    it('should complete full tenant lifecycle', async () => {
      // Step 1: Tenant signs up
      const signupResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'tenant@journey.com',
          password: 'Test123!',
          firstName: 'Journey',
          lastName: 'Tenant',
          phone: '254712345678',
          role: 'tenant'
        })
        .expect(201);

      expect(signupResponse.body).toHaveProperty('token');
      const tenantToken = signupResponse.body.token;
      const tenantId = signupResponse.body.user.id;

      // Step 2: Tenant views their profile
      const profileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(profileResponse.body.email).toBe('tenant@journey.com');

      // Step 3: Create a property (as landlord for testing)
      const landlord = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'landlord@journey.com',
        password: 'Test123!',
        firstName: 'Journey',
        lastName: 'Landlord',
        phone: '254712345679',
        role: 'landlord'
      });

      const property = await integrationUtils.createPropertyWithLandlord(
        app,
        request,
        landlord.token
      );

      // Step 4: Tenant views available properties
      const propertiesResponse = await request(app)
        .get('/api/v1/properties/available')
        .expect(200);

      expect(Array.isArray(propertiesResponse.body)).toBe(true);

      // Step 5: Tenant submits maintenance request
      const maintenanceResponse = await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          title: 'Leaking Faucet',
          description: 'Kitchen faucet is leaking',
          category: 'plumbing',
          priority: 'high',
          propertyId: property._id
        })
        .expect(201);

      expect(maintenanceResponse.body).toHaveProperty('ticketNumber');
      const maintenanceId = maintenanceResponse.body.id;

      // Step 6: Tenant checks maintenance status
      const maintenanceStatusResponse = await request(app)
        .get(`/api/v1/tenant/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(maintenanceStatusResponse.body.status).toBe('submitted');

      // Step 7: Tenant views all their maintenance requests
      const allMaintenanceResponse = await request(app)
        .get('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(allMaintenanceResponse.body.length).toBe(1);

      // Step 8: Tenant views notifications
      const notificationsResponse = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(Array.isArray(notificationsResponse.body)).toBe(true);

      // Step 9: Tenant changes password
      const passwordChangeResponse = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          currentPassword: 'Test123!',
          newPassword: 'NewPassword123!'
        })
        .expect(200);

      expect(passwordChangeResponse.body.success).toBe(true);

      // Step 10: Tenant logs in with new password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'tenant@journey.com',
          password: 'NewPassword123!'
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');

      // Step 11: Tenant logs out
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
    });
  });

  describe('Landlord Complete Journey', () => {
    it('should complete full landlord lifecycle', async () => {
      // Step 1: Landlord signs up
      const landlord = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'landlord@complete.com',
        password: 'Test123!',
        firstName: 'Complete',
        lastName: 'Landlord',
        phone: '254712345680',
        role: 'landlord'
      });

      // Step 2: Landlord creates property
      const propertyResponse = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${landlord.token}`)
        .send({
          name: 'Landlord Property',
          address: '456 Landlord St, Nairobi',
          type: 'apartment',
          units: 15,
          monthlyRent: 60000,
          bedrooms: 3,
          bathrooms: 2
        })
        .expect(201);

      const propertyId = propertyResponse.body._id;

      // Step 3: Landlord views their properties
      const propertiesResponse = await request(app)
        .get('/api/v1/properties/landlord')
        .set('Authorization', `Bearer ${landlord.token}`)
        .expect(200);

      expect(propertiesResponse.body.length).toBe(1);

      // Step 4: Landlord updates property
      const updateResponse = await request(app)
        .put(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${landlord.token}`)
        .send({
          name: 'Updated Property Name',
          monthlyRent: 65000
        })
        .expect(200);

      expect(updateResponse.body.name).toBe('Updated Property Name');
      expect(updateResponse.body.monthlyRent).toBe(65000);

      // Step 5: Landlord updates rent
      const rentUpdateResponse = await request(app)
        .put(`/api/v1/properties/${propertyId}/rent`)
        .set('Authorization', `Bearer ${landlord.token}`)
        .send({ amount: 70000 })
        .expect(200);

      expect(rentUpdateResponse.body.monthlyRent).toBe(70000);

      // Step 6: Create tenant and maintenance request
      const tenant = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'tenant@landlord.com',
        password: 'Test123!',
        firstName: 'Tenant',
        lastName: 'User',
        phone: '254712345681',
        role: 'tenant'
      });

      await request(app)
        .post('/api/v1/tenant/maintenance')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({
          title: 'Broken Window',
          description: 'Window needs repair',
          category: 'general',
          priority: 'medium',
          propertyId: propertyId
        })
        .expect(201);

      // Step 7: Landlord views maintenance requests
      const maintenanceResponse = await request(app)
        .get('/api/v1/maintenance')
        .set('Authorization', `Bearer ${landlord.token}`)
        .expect(200);

      expect(Array.isArray(maintenanceResponse.body)).toBe(true);

      // Step 8: Landlord creates vendor
      const vendorResponse = await request(app)
        .post('/api/v1/vendors')
        .set('Authorization', `Bearer ${landlord.token}`)
        .send({
          name: 'Reliable Repairs',
          serviceTypes: ['plumbing', 'electrical'],
          phone: '+254722111222',
          email: 'repairs@vendor.com'
        })
        .expect(201);

      expect(vendorResponse.body.name).toBe('Reliable Repairs');

      // Step 9: Landlord views vendors
      const vendorsResponse = await request(app)
        .get('/api/v1/vendors')
        .set('Authorization', `Bearer ${landlord.token}`)
        .expect(200);

      expect(vendorsResponse.body.length).toBeGreaterThan(0);
    });
  });

  describe('Move-Out Complete Journey', () => {
    it('should complete full move-out and deposit refund process', async () => {
      // Setup: Create tenant, landlord, property, and lease
      const tenant = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'moveout@tenant.com',
        password: 'Test123!',
        firstName: 'MoveOut',
        lastName: 'Tenant',
        phone: '254712345682',
        role: 'tenant'
      });

      const landlord = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'moveout@landlord.com',
        password: 'Test123!',
        firstName: 'MoveOut',
        lastName: 'Landlord',
        phone: '254712345683',
        role: 'landlord'
      });

      const property = await integrationUtils.createPropertyWithLandlord(
        app,
        request,
        landlord.token
      );

      // Create lease
      const Lease = require('../../models/lease.model');
      const lease = await Lease.create({
        tenant: tenant.userId,
        property: property._id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-01-01'),
        monthlyRent: 50000,
        securityDeposit: 50000,
        status: 'active'
      });

      // Step 1: Tenant submits move-out request
      const moveOutResponse = await request(app)
        .post('/api/v1/tenant/move-out/request')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({
          propertyId: property._id,
          leaseId: lease._id,
          moveOutDate: '2024-12-31',
          reason: 'Relocating to another city',
          forwardingAddress: '789 New City, Mombasa'
        })
        .expect(201);

      expect(moveOutResponse.body.success).toBe(true);
      expect(moveOutResponse.body).toHaveProperty('referenceNumber');
      const moveOutRequestId = moveOutResponse.body.moveOutRequest.id;

      // Step 2: Tenant checks move-out status
      const statusResponse = await request(app)
        .get(`/api/v1/tenant/move-out/status/${moveOutRequestId}`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('pending');

      // Step 3: Tenant checks current move-out request
      const currentResponse = await request(app)
        .get('/api/v1/tenant/move-out/current')
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);

      expect(currentResponse.body).not.toBeNull();
      expect(currentResponse.body.status).toBe('pending');

      // Step 4: Tenant requests deposit refund
      const refundResponse = await request(app)
        .post('/api/v1/tenant/deposit/refund')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({
          moveOutRequestId: moveOutRequestId,
          depositAmount: 50000,
          bankDetails: {
            accountNumber: '1234567890',
            bankName: 'KCB Bank',
            accountName: 'MoveOut Tenant'
          }
        })
        .expect(201);

      expect(refundResponse.body.success).toBe(true);
      const refundId = refundResponse.body.refundRequest.id;

      // Step 5: Tenant checks deposit refund status
      const refundStatusResponse = await request(app)
        .get(`/api/v1/tenant/deposit/status/${refundId}`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);

      expect(refundStatusResponse.body.status).toBe('submitted');
      expect(refundStatusResponse.body.depositAmount).toBe(50000);

      // Step 6: Tenant checks current deposit refund
      const currentRefundResponse = await request(app)
        .get('/api/v1/tenant/deposit/current')
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);

      expect(currentRefundResponse.body).not.toBeNull();
      expect(currentRefundResponse.body.status).toBe('submitted');
    });
  });

  describe('Communication Journey', () => {
    it('should complete messaging and notification flow', async () => {
      // Create two users
      const user1 = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'user1@comm.com',
        password: 'Test123!',
        firstName: 'User',
        lastName: 'One',
        phone: '254712345684',
        role: 'tenant'
      });

      const user2 = await integrationUtils.createAuthenticatedUser(app, request, {
        email: 'user2@comm.com',
        password: 'Test123!',
        firstName: 'User',
        lastName: 'Two',
        phone: '254712345685',
        role: 'landlord'
      });

      // Step 1: User1 sends message to User2
      const sendMessageResponse = await request(app)
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          recipientId: user2.userId,
          message: 'Hello, I have a question about the property'
        })
        .expect(201);

      expect(sendMessageResponse.body.success).toBe(true);
      const conversationId = sendMessageResponse.body.message.conversation;

      // Step 2: User2 views conversations
      const conversationsResponse = await request(app)
        .get(`/api/v1/messages/conversations/${user2.userId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .expect(200);

      expect(conversationsResponse.body.length).toBe(1);
      expect(conversationsResponse.body[0].unreadCount).toBeGreaterThan(0);

      // Step 3: User2 reads messages
      const messagesResponse = await request(app)
        .get(`/api/v1/messages/${conversationId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .expect(200);

      expect(messagesResponse.body.length).toBe(1);
      expect(messagesResponse.body[0].message).toContain('question about the property');

      // Step 4: User2 replies
      const replyResponse = await request(app)
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          conversationId: conversationId,
          message: 'Sure, how can I help you?'
        })
        .expect(201);

      expect(replyResponse.body.success).toBe(true);

      // Step 5: User1 checks unread count
      const unreadResponse = await request(app)
        .get(`/api/v1/messages/unread-count/${user1.userId}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .expect(200);

      expect(unreadResponse.body.count).toBeGreaterThan(0);

      // Step 6: User1 marks messages as read
      const markReadResponse = await request(app)
        .put(`/api/v1/messages/${conversationId}/read`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ userId: user1.userId })
        .expect(200);

      expect(markReadResponse.body.success).toBe(true);
    });
  });
});
