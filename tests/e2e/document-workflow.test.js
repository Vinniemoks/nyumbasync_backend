const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const app = require('../../server').app;
const User = require('../../models/user.model');
const Document = require('../../models/document.model');

require('./setup');

let mongoServer;

describe('E2E: Document Management Workflow', () => {
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
    await Document.deleteMany({});
  });

  it('should complete document upload and management workflow', async () => {
    // 1. Create tenant
    const tenant = await e2eUtils.completeUserOnboarding(app, request, 'tenant');

    // 2. Create test file
    const testFilePath = path.join(__dirname, '../test-doc.txt');
    fs.writeFileSync(testFilePath, 'Test document content for E2E testing');

    // 3. Upload document
    const uploadResponse = await request(app)
      .post('/api/v1/tenant/documents')
      .set('Authorization', `Bearer ${tenant.token}`)
      .attach('file', testFilePath)
      .field('name', 'E2E Test Document')
      .field('category', 'personal')
      .expect(201);

    expect(uploadResponse.body.success).toBe(true);
    const documentId = uploadResponse.body.document._id;

    // 4. View uploaded documents
    const documentsResponse = await request(app)
      .get('/api/v1/tenant/documents')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(documentsResponse.body.length).toBe(1);

    // 5. Get document by ID
    const documentResponse = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(documentResponse.body.name).toBe('E2E Test Document');

    // 6. Get document categories
    const categoriesResponse = await request(app)
      .get('/api/v1/documents/categories')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(categoriesResponse.body).toContain('personal');

    // 7. Delete document
    await request(app)
      .delete(`/api/v1/tenant/documents/${documentId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    // 8. Verify deletion
    const afterDeleteResponse = await request(app)
      .get('/api/v1/tenant/documents')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    expect(afterDeleteResponse.body.length).toBe(0);

    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });
});
