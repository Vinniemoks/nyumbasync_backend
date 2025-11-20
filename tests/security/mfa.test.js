/**
 * MFA (Multi-Factor Authentication) Tests
 * Tests TOTP-based 2FA functionality
 */

const request = require('supertest');
const { expect } = require('chai');
const mongoose = require('mongoose');
const User = require('../../models/user.model');
const mfaService = require('../../services/mfa.service');

describe('MFA Security Tests', () => {
  let app;
  let testUser;
  let authToken;

  before(async () => {
    // Import app
    app = require('../../server');

    // Create test user
    testUser = await User.create({
      firstName: 'MFA',
      lastName: 'Test',
      email: 'mfa@test.com',
      phone: '254712345678',
      password: 'TestPassword123!',
      role: 'tenant'
    });

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'mfa@test.com',
        password: 'TestPassword123!'
      });

    authToken = loginRes.body.token;
  });

  after(async () => {
    // Cleanup
    await User.deleteOne({ email: 'mfa@test.com' });
  });

  describe('MFA Setup', () => {
    it('should enable MFA and return QR code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('qrCode');
      expect(res.body.data).to.have.property('secret');
      expect(res.body.data).to.have.property('backupCodes');
      expect(res.body.data.backupCodes).to.be.an('array').with.lengthOf(10);
    });

    it('should not allow enabling MFA twice', async () => {
      // Enable MFA first time
      await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`);

      // Try to enable again
      const res = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body).to.have.property('error');
    });

    it('should require authentication to enable MFA', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .expect(401);

      expect(res.body).to.have.property('error');
    });
  });

  describe('MFA Verification', () => {
    let mfaSecret;

    before(async () => {
      // Get MFA secret
      const user = await User.findById(testUser._id).select('+mfaSecret');
      mfaSecret = user.mfaSecret;
    });

    it('should verify valid MFA token', async () => {
      // Generate valid token
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.message).to.include('enabled');
    });

    it('should reject invalid MFA token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: '000000' })
        .expect(400);

      expect(res.body).to.have.property('error');
    });

    it('should require token in request', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.error).to.include('token');
    });
  });

  describe('MFA Login Flow', () => {
    let mfaUser;
    let mfaSecret;

    before(async () => {
      // Create user with MFA enabled
      mfaUser = await User.create({
        firstName: 'MFA',
        lastName: 'Login',
        email: 'mfalogin@test.com',
        phone: '254712345679',
        password: 'TestPassword123!',
        role: 'tenant',
        mfaEnabled: true
      });

      // Generate and save MFA secret
      const { secret } = await mfaService.generateSecret(mfaUser.email);
      mfaUser.mfaSecret = secret;
      mfaUser.mfaVerified = true;
      await mfaUser.save();
      mfaSecret = secret;
    });

    after(async () => {
      await User.deleteOne({ email: 'mfalogin@test.com' });
    });

    it('should require MFA token during login', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'mfalogin@test.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(res.body).to.have.property('mfaRequired', true);
      expect(res.body).to.have.property('mfaSessionToken');
      expect(res.body).not.to.have.property('token');
    });

    it('should complete login with valid MFA token', async () => {
      // First, get MFA session token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'mfalogin@test.com',
          password: 'TestPassword123!'
        });

      const { mfaSessionToken } = loginRes.body;

      // Generate valid MFA token
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      // Verify MFA and complete login
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken,
          token
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('accessToken');
      expect(res.body.data).to.have.property('refreshToken');
    });

    it('should reject invalid MFA token during login', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'mfalogin@test.com',
          password: 'TestPassword123!'
        });

      const { mfaSessionToken } = loginRes.body;

      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken,
          token: '000000'
        })
        .expect(401);

      expect(res.body).to.have.property('error');
    });

    it('should reject expired MFA session token', async () => {
      const expiredToken = Buffer.from(`${mfaUser._id}:token:${Date.now() - 10 * 60 * 1000}`).toString('base64');

      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken: expiredToken,
          token: '123456'
        })
        .expect(401);

      expect(res.body.error).to.include('expired');
    });
  });

  describe('MFA Backup Codes', () => {
    let mfaUser;
    let backupCodes;

    before(async () => {
      // Create user with MFA and backup codes
      const codes = mfaService.generateBackupCodes(10);
      const hashedCodes = codes.map(code => mfaService.hashBackupCode(code));

      mfaUser = await User.create({
        firstName: 'Backup',
        lastName: 'Test',
        email: 'backup@test.com',
        phone: '254712345680',
        password: 'TestPassword123!',
        role: 'tenant',
        mfaEnabled: true,
        mfaBackupCodes: hashedCodes
      });

      const { secret } = await mfaService.generateSecret(mfaUser.email);
      mfaUser.mfaSecret = secret;
      await mfaUser.save();

      backupCodes = codes;
    });

    after(async () => {
      await User.deleteOne({ email: 'backup@test.com' });
    });

    it('should login with backup code', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'backup@test.com',
          password: 'TestPassword123!'
        });

      const { mfaSessionToken } = loginRes.body;

      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken,
          backupCode: backupCodes[0]
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('accessToken');
    });

    it('should not reuse backup code', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'backup@test.com',
          password: 'TestPassword123!'
        });

      const { mfaSessionToken } = loginRes.body;

      // Try to use same backup code again
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken,
          backupCode: backupCodes[0]
        })
        .expect(401);

      expect(res.body).to.have.property('error');
    });
  });

  describe('MFA Status', () => {
    it('should return MFA status for user', async () => {
      const res = await request(app)
        .get('/api/v1/auth/mfa/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('mfaEnabled');
      expect(res.body.data).to.have.property('mfaVerified');
      expect(res.body.data).to.have.property('backupCodesRemaining');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/v1/auth/mfa/status')
        .expect(401);

      expect(res.body).to.have.property('error');
    });
  });

  describe('MFA Disable', () => {
    let userToken;
    let userWithMFA;

    before(async () => {
      // Create user with MFA
      userWithMFA = await User.create({
        firstName: 'Disable',
        lastName: 'Test',
        email: 'disable@test.com',
        phone: '254712345681',
        password: 'TestPassword123!',
        role: 'tenant',
        mfaEnabled: true
      });

      const { secret } = await mfaService.generateSecret(userWithMFA.email);
      userWithMFA.mfaSecret = secret;
      await userWithMFA.save();

      // Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'disable@test.com',
          password: 'TestPassword123!'
        });

      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret,
        encoding: 'base32'
      });

      const mfaRes = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          mfaSessionToken: loginRes.body.mfaSessionToken,
          token
        });

      userToken = mfaRes.body.data.accessToken;
    });

    after(async () => {
      await User.deleteOne({ email: 'disable@test.com' });
    });

    it('should disable MFA with password and token', async () => {
      const user = await User.findById(userWithMFA._id).select('+mfaSecret');
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: user.mfaSecret,
        encoding: 'base32'
      });

      const res = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          password: 'TestPassword123!',
          token
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.message).to.include('disabled');
    });

    it('should require password to disable MFA', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ token: '123456' })
        .expect(400);

      expect(res.body.error).to.include('password');
    });
  });
});
