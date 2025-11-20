const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Message = require('../../models/message.model');
const Conversation = require('../../models/conversation.model');

require('./setup');

let mongoServer;

describe('E2E: Multi-User Workflows', () => {
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
    await Message.deleteMany({});
    await Conversation.deleteMany({});
  });

  it('should handle landlord-tenant communication workflow', async () => {
    // 1. Create landlord and tenant
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    const tenant = await e2eUtils.completeUserOnboarding(app, request, 'tenant');

    // 2. Landlord creates property
    const property = await e2eUtils.propertyApplicationFlow(
      app,
      request,
      landlord.token,
      tenant.token
    );

    // 3. Tenant sends inquiry
    const messageResponse = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        recipientId: landlord.user.id,
        message: 'Is the property still available?'
      })
      .expect(201);

    const conversationId = messageResponse.body.message.conversation;

    // 4. Landlord checks messages
    const conversationsResponse = await request(app)
      .get(`/api/v1/messages/conversations/${landlord.user.id}`)
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(conversationsResponse.body.length).toBe(1);

    // 5. Landlord replies
    await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${landlord.token}`)
      .send({
        conversationId,
        message: 'Yes, it is available. Would you like to schedule a viewing?'
      })
      .expect(201);

    // 6. Tenant reads reply
    const messagesResponse = await request(app)
      .get(`/api/v1/messages/${conversationId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(messagesResponse.body.length).toBe(2);
  });

  it('should handle multi-tenant property scenario', async () => {
    // Multiple tenants interacting with same property
    
    const landlord = await e2eUtils.completeUserOnboarding(app, request, 'landlord');
    const tenant1 = await e2eUtils.completeUserOnboarding(app, request, 'tenant');
    
    // Create second tenant manually
    const tenant2Response = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'tenant2@e2e.com',
        password: 'Test123!',
        firstName: 'Tenant',
        lastName: 'Two',
        phone: '254712345699',
        role: 'tenant'
      });
    
    const tenant2 = tenant2Response.body;

    // Create property
    const property = await e2eUtils.propertyApplicationFlow(
      app,
      request,
      landlord.token,
      tenant1.token
    );

    // Both tenants submit maintenance
    await e2eUtils.maintenanceResolutionFlow(
      app,
      request,
      tenant1.token,
      property._id
    );

    await e2eUtils.maintenanceResolutionFlow(
      app,
      request,
      tenant2.token,
      property._id
    );

    // Landlord views all maintenance
    const maintenanceResponse = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${landlord.token}`)
      .expect(200);

    expect(maintenanceResponse.body.length).toBe(2);
  });
});
