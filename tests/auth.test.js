const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');

let mongoServer;

describe('Authentication Tests', () => {
  beforeAll(async () => {
    // Create in-memory MongoDB instance
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
    // Clear database before each test
    await User.deleteMany({});
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'Test123!',
        firstName: 'New',
        lastName: 'User',
        phone: '254712345678',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should create a user with a real-world idNumber (regression)', async () => {
      // The old national-ID validator applied a fictional checksum that
      // rejected most real 8-digit IDs, 400-ing signup for real users.
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'idnumber@example.com',
          password: 'Test123!',
          firstName: 'Id',
          lastName: 'Holder',
          phoneNumber: '254712345670',
          idNumber: '12345678',
          roles: ['landlord']
        })
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.role).toBe('landlord');
    });

    it('should reject signup with missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'test@example.com'
          // Missing password, firstName, lastName, phone
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject signup with duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'Test123!',
        firstName: 'Test',
        lastName: 'User',
        phone: '254712345678',
        role: 'tenant'
      };

      // Create first user
      await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ ...userData, phone: '254712345679' })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject weak passwords', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: '123', // Too short
          firstName: 'Test',
          lastName: 'User',
          phone: '254712345678',
          role: 'tenant'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'login@example.com',
          password: 'Test123!',
          firstName: 'Login',
          lastName: 'User',
          phone: '254712345678',
          role: 'tenant'
        });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'login@example.com',
          password: 'Test123!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('login@example.com');
    });

    it('should login with phone number', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: '254712345678',
          password: 'Test123!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'wrong@example.com',
          password: 'Test123!'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'login@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Phone number normalization', () => {
    // Prod had "+254724093238" and bare "254..." rows coexisting, and two
    // accounts for the same number in different formats — exact-string
    // matching let variants slip past both the dup-check and the unique
    // index. All formats must collapse to canonical 254XXXXXXXXX.
    const baseUser = {
      password: 'Test123!',
      firstName: 'Format',
      lastName: 'Variant',
      role: 'tenant'
    };

    it('should store signup phone in canonical 254 form and reject format variants as duplicates', async () => {
      await request(app)
        .post('/api/v1/auth/signup')
        .send({ ...baseUser, email: 'plus@example.com', phone: '+254712345678' })
        .expect(201);

      const stored = await User.findOne({ email: 'plus@example.com' });
      expect(stored.phone).toBe('254712345678');

      await request(app)
        .post('/api/v1/auth/signup')
        .send({ ...baseUser, email: 'local@example.com', phone: '0712345678' })
        .expect(409);

      await request(app)
        .post('/api/v1/auth/signup')
        .send({ ...baseUser, email: 'bare@example.com', phone: '254712345678' })
        .expect(409);

      expect(await User.countDocuments({})).toBe(1);
    });

    it('should login by phone regardless of input format', async () => {
      await request(app)
        .post('/api/v1/auth/signup')
        .send({ ...baseUser, email: 'phoneformats@example.com', phone: '254712345678' })
        .expect(201);

      for (const identifier of ['254712345678', '+254712345678', '0712345678']) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ identifier, password: 'Test123!' })
          .expect(200);

        expect(response.body).toHaveProperty('token');
      }
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let token;
    let userId;

    beforeEach(async () => {
      // Create and login a user
      const signupResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'me@example.com',
          password: 'Test123!',
          firstName: 'Me',
          lastName: 'User',
          phone: '254712345678',
          role: 'tenant'
        });

      token = signupResponse.body.token;
      userId = signupResponse.body.user.id;
    });

    it('should get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('me@example.com');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let token;

    beforeEach(async () => {
      const signupResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'logout@example.com',
          password: 'Test123!',
          firstName: 'Logout',
          lastName: 'User',
          phone: '254712345678',
          role: 'tenant'
        });

      token = signupResponse.body.token;
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let token;

    beforeEach(async () => {
      const signupResponse = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'changepass@example.com',
          password: 'OldPassword123!',
          firstName: 'Change',
          lastName: 'Password',
          phone: '254712345678',
          role: 'tenant'
        });

      token = signupResponse.body.token;
    });

    it('should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'changepass@example.com',
          password: 'NewPassword123!'
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should reject password change with wrong current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
