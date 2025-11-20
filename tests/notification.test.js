const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

let mongoServer;
let token;
let userId;

describe('Notification Controller Tests', () => {
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
    await Notification.deleteMany({});

    const signupResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'notiftest@example.com',
        password: 'Test123!',
        firstName: 'Notif',
        lastName: 'Test',
        phone: '254712345678',
        role: 'tenant'
      });

    token = signupResponse.body.token;
    userId = signupResponse.body.user.id;
  });

  describe('GET /api/v1/notifications', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          user: userId,
          type: 'payment_due',
          title: 'Rent Payment Due',
          message: 'Your rent is due in 3 days',
          channels: ['email', 'in_app'],
          status: 'sent'
        },
        {
          user: userId,
          type: 'maintenance_update',
          title: 'Maintenance Update',
          message: 'Your request has been assigned',
          channels: ['in_app'],
          status: 'delivered'
        }
      ]);
    });

    it('should get all notifications for user', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('message');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/notifications/user/:userId/unread-count', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          user: userId,
          type: 'payment_due',
          title: 'Unread 1',
          message: 'Message 1',
          channels: ['in_app'],
          status: 'sent'
        },
        {
          user: userId,
          type: 'payment_due',
          title: 'Unread 2',
          message: 'Message 2',
          channels: ['in_app'],
          status: 'delivered'
        },
        {
          user: userId,
          type: 'payment_due',
          title: 'Read',
          message: 'Message 3',
          channels: ['in_app'],
          status: 'read'
        }
      ]);
    });

    it('should get unread notification count', async () => {
      const response = await request(app)
        .get(`/api/v1/notifications/user/${userId}/unread-count`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body.count).toBe(2);
    });
  });

  describe('PUT /api/v1/notifications/:notificationId/read', () => {
    let notificationId;

    beforeEach(async () => {
      const notification = await Notification.create({
        user: userId,
        type: 'payment_due',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['in_app'],
        status: 'sent'
      });
      notificationId = notification._id;
    });

    it('should mark notification as read', async () => {
      const response = await request(app)
        .put(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify notification is marked as read
      const notification = await Notification.findById(notificationId);
      expect(notification.status).toBe('read');
      expect(notification.readAt).toBeDefined();
    });

    it('should not mark notification of another user', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'other@example.com',
          password: 'Test123!',
          firstName: 'Other',
          lastName: 'User',
          phone: '254712345679',
          role: 'tenant'
        });

      const otherToken = otherUserResponse.body.token;

      const response = await request(app)
        .put(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/notifications/user/:userId/read-all', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          user: userId,
          type: 'payment_due',
          title: 'Notification 1',
          message: 'Message 1',
          channels: ['in_app'],
          status: 'sent'
        },
        {
          user: userId,
          type: 'payment_due',
          title: 'Notification 2',
          message: 'Message 2',
          channels: ['in_app'],
          status: 'delivered'
        }
      ]);
    });

    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .put(`/api/v1/notifications/user/${userId}/read-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify all notifications are marked as read
      const unreadCount = await Notification.countDocuments({
        user: userId,
        status: { $in: ['sent', 'delivered'] }
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe('DELETE /api/v1/notifications/:notificationId', () => {
    let notificationId;

    beforeEach(async () => {
      const notification = await Notification.create({
        user: userId,
        type: 'payment_due',
        title: 'Delete Test',
        message: 'Test message',
        channels: ['in_app'],
        status: 'sent'
      });
      notificationId = notification._id;
    });

    it('should delete notification', async () => {
      const response = await request(app)
        .delete(`/api/v1/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify notification is deleted
      const notification = await Notification.findById(notificationId);
      expect(notification).toBeNull();
    });
  });

  describe('GET /api/v1/notifications/user/:userId/preferences', () => {
    it('should get notification preferences', async () => {
      const response = await request(app)
        .get(`/api/v1/notifications/user/${userId}/preferences`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('sms');
      expect(response.body).toHaveProperty('push');
      expect(response.body).toHaveProperty('categories');
    });
  });

  describe('PUT /api/v1/notifications/user/:userId/preferences', () => {
    it('should update notification preferences', async () => {
      const preferences = {
        email: true,
        sms: false,
        push: true,
        categories: {
          payments: true,
          maintenance: false,
          messages: true
        }
      };

      const response = await request(app)
        .put(`/api/v1/notifications/user/${userId}/preferences`)
        .set('Authorization', `Bearer ${token}`)
        .send(preferences)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('preferences');
    });
  });
});
