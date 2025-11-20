const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');
const fs = require('fs');
const app = require('../server').app;
const User = require('../models/user.model');
const Document = require('../models/document.model');

let mongoServer;
let token;
let userId;

describe('Document Controller Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Create test uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Clean up test uploads
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Document.deleteMany({});

    // Create test user and get token
    const signupResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'doctest@example.com',
        password: 'Test123!',
        firstName: 'Doc',
        lastName: 'Test',
        phone: '254712345678',
        role: 'tenant'
      });

    token = signupResponse.body.token;
    userId = signupResponse.body.user.id;
  });

  describe('GET /api/v1/documents', () => {
    beforeEach(async () => {
      // Create test documents
      await Document.create([
        {
          name: 'Test Document 1',
          category: 'lease',
          fileUrl: '/uploads/test1.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          uploadedBy: userId,
          uploadedByRole: 'tenant'
        },
        {
          name: 'Test Document 2',
          category: 'personal',
          fileUrl: '/uploads/test2.pdf',
          fileType: 'application/pdf',
          fileSize: 2048,
          uploadedBy: userId,
          uploadedByRole: 'tenant'
        }
      ]);
    });

    it('should get all documents for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('category');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/documents')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/documents/:id', () => {
    let documentId;

    beforeEach(async () => {
      const doc = await Document.create({
        name: 'Single Test Document',
        category: 'lease',
        fileUrl: '/uploads/single.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        uploadedBy: userId,
        uploadedByRole: 'tenant'
      });
      documentId = doc._id;
    });

    it('should get document by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Single Test Document');
      expect(response.body).toHaveProperty('category', 'lease');
    });

    it('should return 404 for non-existent document', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/v1/documents/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/documents/upload', () => {
    it('should upload a document with file', async () => {
      // Create a test file
      const testFilePath = path.join(__dirname, 'test-upload.txt');
      fs.writeFileSync(testFilePath, 'Test document content');

      const response = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', testFilePath)
        .field('name', 'Uploaded Test Document')
        .field('category', 'personal')
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('document');
      expect(response.body.document).toHaveProperty('name', 'Uploaded Test Document');

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('name', 'No File Document')
        .field('category', 'personal')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload without authentication', async () => {
      const testFilePath = path.join(__dirname, 'test-upload.txt');
      fs.writeFileSync(testFilePath, 'Test content');

      const response = await request(app)
        .post('/api/v1/documents/upload')
        .attach('file', testFilePath)
        .expect(401);

      expect(response.body).toHaveProperty('error');

      fs.unlinkSync(testFilePath);
    });
  });

  describe('DELETE /api/v1/documents/:documentId', () => {
    let documentId;

    beforeEach(async () => {
      const doc = await Document.create({
        name: 'Document to Delete',
        category: 'personal',
        fileUrl: '/uploads/delete.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        uploadedBy: userId,
        uploadedByRole: 'tenant'
      });
      documentId = doc._id;
    });

    it('should delete own document', async () => {
      const response = await request(app)
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify document is deleted
      const doc = await Document.findById(documentId);
      expect(doc).toBeNull();
    });

    it('should not delete document of another user', async () => {
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
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/documents/categories', () => {
    it('should get document categories', async () => {
      const response = await request(app)
        .get('/api/v1/documents/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toContain('lease');
      expect(response.body).toContain('inspection');
      expect(response.body).toContain('personal');
    });
  });

  describe('GET /api/v1/tenant/documents', () => {
    beforeEach(async () => {
      await Document.create([
        {
          name: 'Tenant Document 1',
          category: 'personal',
          fileUrl: '/uploads/tenant1.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          uploadedBy: userId,
          uploadedByRole: 'tenant',
          tenant: userId
        },
        {
          name: 'Tenant Document 2',
          category: 'lease',
          fileUrl: '/uploads/tenant2.pdf',
          fileType: 'application/pdf',
          fileSize: 2048,
          uploadedBy: userId,
          uploadedByRole: 'tenant',
          tenant: userId
        }
      ]);
    });

    it('should get tenant-specific documents', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/documents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });
  });
});
