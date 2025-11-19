const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');

let mongoServer;
let token1, token2;
let user1Id, user2Id;

describe('Message Controller Tests', () => {
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
    await Message.deleteMany({});
    await Conversation.deleteMany({});

    // Create two test users
    const user1Response = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'user1@example.com',
        password: 'Test123!',
        firstName: 'User',
        lastName: 'One',
        phone: '254712345678',
        role: 'tenant'
      });

    const user2Response = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'user2@example.com',
        password: 'Test123!',
        firstName: 'User',
        lastName: 'Two',
        phone: '254712345679',
        role: 'landlord'
      });

    token1 = user1Response.body.token;
    user1Id = user1Response.body.user.id;
    token2 = user2Response.body.token;
    user2Id = user2Response.body.user.id;
  });

  describe('POST /api/v1/messages/send', () => {
    it('should send a message and create conversation', async () => {
      const response = await request(app)
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          recipientId: user2Id,
          message: 'Hello, this is a test message'
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toHaveProperty('message', 'Hello, this is a test message');
      expect(response.body.message).toHaveProperty('sender');

      // Verify conversation was created
      const conversation = await Conversation.findOne({
        participants: { $all: [user1Id, user2Id] }
      });
      expect(conversation).toBeDefined();
    });

    it('should send message to existing conversation', async () => {
      // Create conversation first
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });

      const response = await request(app)
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation._id,
          message: 'Message to existing conversation'
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toHaveProperty('conversation');
    });

    it('should reject message without recipient or conversation', async () => {
      const response = await request(app)
        .post('/api/v1/messages/send')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          message: 'Message without recipient'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/messages/conversations/:userId', () => {
    beforeEach(async () => {
      // Create conversations
      const conv1 = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct',
        lastMessage: 'Last message 1',
        lastMessageAt: new Date()
      });

      await Message.create({
        conversation: conv1._id,
        sender: user2Id,
        message: 'Unread message',
        messageType: 'text'
      });
    });

    it('should get user conversations with unread count', async () => {
      const response = await request(app)
        .get(`/api/v1/messages/conversations/${user1Id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('participants');
      expect(response.body[0]).toHaveProperty('lastMessage');
      expect(response.body[0]).toHaveProperty('unreadCount');
    });
  });

  describe('GET /api/v1/messages/:conversationId', () => {
    let conversationId;

    beforeEach(async () => {
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });
      conversationId = conversation._id;

      await Message.create([
        {
          conversation: conversationId,
          sender: user1Id,
          message: 'Message 1',
          messageType: 'text'
        },
        {
          conversation: conversationId,
          sender: user2Id,
          message: 'Message 2',
          messageType: 'text'
        }
      ]);
    });

    it('should get messages in conversation', async () => {
      const response = await request(app)
        .get(`/api/v1/messages/${conversationId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('message');
      expect(response.body[0]).toHaveProperty('sender');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/api/v1/messages/${conversationId}?page=1&limit=1`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
    });
  });

  describe('PUT /api/v1/messages/:conversationId/read', () => {
    let conversationId;

    beforeEach(async () => {
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });
      conversationId = conversation._id;

      await Message.create({
        conversation: conversationId,
        sender: user2Id,
        message: 'Unread message',
        messageType: 'text'
      });
    });

    it('should mark messages as read', async () => {
      const response = await request(app)
        .put(`/api/v1/messages/${conversationId}/read`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ userId: user1Id })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/messages/unread-count/:userId', () => {
    beforeEach(async () => {
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });

      await Message.create([
        {
          conversation: conversation._id,
          sender: user2Id,
          message: 'Unread 1',
          messageType: 'text'
        },
        {
          conversation: conversation._id,
          sender: user2Id,
          message: 'Unread 2',
          messageType: 'text'
        }
      ]);
    });

    it('should get unread message count', async () => {
      const response = await request(app)
        .get(`/api/v1/messages/unread-count/${user1Id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body.count).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/messages/conversations', () => {
    it('should create a new conversation', async () => {
      const response = await request(app)
        .post('/api/v1/messages/conversations')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          participantIds: [user1Id, user2Id]
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('conversation');
      expect(response.body.conversation).toHaveProperty('participants');
    });
  });

  describe('DELETE /api/v1/messages/:messageId', () => {
    let messageId;

    beforeEach(async () => {
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });

      const message = await Message.create({
        conversation: conversation._id,
        sender: user1Id,
        message: 'Message to delete',
        messageType: 'text'
      });
      messageId = message._id;
    });

    it('should delete a message', async () => {
      const response = await request(app)
        .delete(`/api/v1/messages/${messageId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/tenant/messages', () => {
    beforeEach(async () => {
      const conversation = await Conversation.create({
        participants: [user1Id, user2Id],
        type: 'direct'
      });

      await Message.create({
        conversation: conversation._id,
        sender: user2Id,
        message: 'Message for tenant',
        messageType: 'text'
      });
    });

    it('should get tenant messages', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/messages')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
