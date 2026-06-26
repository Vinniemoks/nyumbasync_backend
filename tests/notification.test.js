const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const { makeUser } = require('./helpers/factories');

// models-as-truth: Notification requires recipient (ObjectId), recipientRole
// (enum), type (enum: rent_reminder/...), title, message; status enum
// pending|sent|delivered|read|failed. Controller responses are { success, data }.
// Only the implemented endpoints are covered (preferences/user-list handlers
// are not implemented in the controller).

let mongoServer, token, userId;

const seed = (over = {}) => Notification.create({
  recipient: userId,
  recipientRole: 'tenant',
  type: 'rent_reminder',
  title: 'Rent due',
  message: 'Your rent is due soon.',
  status: 'pending',
  ...over
});

describe('Notification Controller Tests', () => {
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
    await Notification.deleteMany({});
    const t = await makeUser('tenant');
    token = t.token; userId = t.user._id;
  });

  describe('GET /api/v1/notifications', () => {
    beforeEach(async () => {
      await seed({ title: 'First' });
      await seed({ title: 'Second', status: 'read', readAt: new Date() });
    });

    it('should get notifications for the user', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app).get('/api/v1/notifications').expect(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/notifications/user/:userId/unread-count', () => {
    beforeEach(async () => {
      await seed();
      await seed();
      await seed({ status: 'read', readAt: new Date() });
    });

    it('should return the unread count', async () => {
      const response = await request(app)
        .get(`/api/v1/notifications/user/${userId}/unread-count`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('count');
      expect(typeof response.body.data.count).toBe('number');
    });
  });

  describe('GET /api/v1/notifications/:id', () => {
    let id;
    beforeEach(async () => { id = (await seed({ title: 'Detail' }))._id; });

    it('should get a notification by id', async () => {
      const response = await request(app)
        .get(`/api/v1/notifications/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('title', 'Detail');
    });

    it('should return 404 for a non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/notifications/:id/read', () => {
    let id;
    beforeEach(async () => { id = (await seed())._id; });

    it('should mark a notification as read', async () => {
      const response = await request(app)
        .put(`/api/v1/notifications/${id}/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('PUT /api/v1/notifications/user/:userId/read-all', () => {
    beforeEach(async () => { await seed(); await seed(); });

    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .put(`/api/v1/notifications/user/${userId}/read-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('DELETE /api/v1/notifications/:id', () => {
    let id;
    beforeEach(async () => { id = (await seed())._id; });

    it('should delete a notification', async () => {
      const response = await request(app)
        .delete(`/api/v1/notifications/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toHaveProperty('success', true);
      expect(await Notification.findById(id)).toBeNull();
    });

    it('should return 404 deleting a non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/v1/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
