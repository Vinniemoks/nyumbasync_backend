/**
 * Password History Tests
 * Tests password reuse prevention and history management
 */

const request = require('supertest');
const { expect } = require('chai');
const User = require('../../models/user.model');
const passwordHistoryService = require('../../services/password-history.service');
const bcrypt = require('bcryptjs');

describe('Password History Security Tests', () => {
  let app;
  let testUser;
  let authToken;

  before(async () => {
    app = require('../../server');

    // Create test user
    testUser = await User.create({
      firstName: 'Password',
      lastName: 'Test',
      email: 'password@test.com',
      phone: '254712345683',
      password: 'InitialPassword123!',
      role: 'tenant'
    });

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'password@test.com',
        password: 'InitialPassword123!'
      });

    authToken = loginRes.body.token;
  });

  after(async () => {
    await User.deleteOne({ email: 'password@test.com' });
  });

  describe('Password Change with History', () => {
    it('should change password successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'InitialPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.message).to.include('successfully');
    });

    it('should reject same password as current', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'NewPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('different');
    });

    it('should prevent reusing recent password', async () => {
      // Change password multiple times
      await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'NewPassword123!',
          newPassword: 'Password2!'
        });

      // Try to reuse first password
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'Password2!',
          newPassword: 'InitialPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('recently');
      expect(res.body.error).to.include('last 5');
    });

    it('should allow password after 5 changes', async () => {
      // Change password 5 times
      const passwords = [
        'Password3!',
        'Password4!',
        'Password5!',
        'Password6!',
        'Password7!'
      ];

      let currentPassword = 'Password2!';
      for (const newPassword of passwords) {
        await request(app)
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword,
            newPassword
          });
        currentPassword = newPassword;
      }

      // Now should be able to reuse InitialPassword123!
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'Password7!',
          newPassword: 'InitialPassword123!'
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
    });

    it('should require minimum password length', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'InitialPassword123!',
          newPassword: 'Short1!'
        })
        .expect(400);

      expect(res.body.error).to.include('8 characters');
    });

    it('should require current password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: 'NewPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('required');
    });

    it('should verify current password is correct', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('incorrect');
    });
  });

  describe('Password Reset with History', () => {
    let resetToken;
    let resetUser;

    before(async () => {
      // Create user for reset testing
      resetUser = await User.create({
        firstName: 'Reset',
        lastName: 'Test',
        email: 'reset@test.com',
        phone: '254712345684',
        password: 'ResetPassword123!',
        role: 'tenant'
      });

      // Generate reset token
      const token = resetUser.createPasswordResetToken();
      await resetUser.save();
      resetToken = token;
    });

    after(async () => {
      await User.deleteOne({ email: 'reset@test.com' });
    });

    it('should reset password with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewResetPassword123!'
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.message).to.include('successfully');
    });

    it('should prevent reusing password in reset', async () => {
      // Generate new reset token
      const user = await User.findById(resetUser._id);
      const token = user.createPasswordResetToken();
      await user.save();

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: 'ResetPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('recently');
    });

    it('should reject invalid reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!'
        })
        .expect(400);

      expect(res.body.error).to.include('Invalid');
    });

    it('should require minimum password length in reset', async () => {
      const user = await User.findById(resetUser._id);
      const token = user.createPasswordResetToken();
      await user.save();

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: 'Short1!'
        })
        .expect(400);

      expect(res.body.error).to.include('8 characters');
    });
  });

  describe('Password History Service', () => {
    it('should detect password reuse', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      const history = [{ hash, changedAt: new Date() }];

      const isReused = await passwordHistoryService.isPasswordReused(password, history);
      expect(isReused).to.be.true;
    });

    it('should not detect different password as reused', async () => {
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword123!';
      const hash = await bcrypt.hash(oldPassword, 12);
      const history = [{ hash, changedAt: new Date() }];

      const isReused = await passwordHistoryService.isPasswordReused(newPassword, history);
      expect(isReused).to.be.false;
    });

    it('should add password to history', async () => {
      const hash = 'hashed-password';
      const history = [];

      const updated = passwordHistoryService.addToHistory(hash, history);

      expect(updated).to.be.an('array').with.lengthOf(1);
      expect(updated[0]).to.have.property('hash', hash);
      expect(updated[0]).to.have.property('changedAt');
    });

    it('should limit history to 5 passwords', async () => {
      let history = [];

      // Add 10 passwords
      for (let i = 0; i < 10; i++) {
        history = passwordHistoryService.addToHistory(`hash-${i}`, history);
      }

      expect(history).to.have.lengthOf(5);
      expect(history[0].hash).to.equal('hash-9'); // Most recent
    });

    it('should validate password against history', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      const history = [{ hash, changedAt: new Date() }];

      const validation = await passwordHistoryService.validatePassword(password, history);

      expect(validation).to.have.property('valid', false);
      expect(validation).to.have.property('error');
    });

    it('should get password age', async () => {
      const lastChanged = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const age = passwordHistoryService.getPasswordAge(lastChanged);

      expect(age).to.have.property('days', 30);
      expect(age).to.have.property('requiresChange', false);
      expect(age).to.have.property('daysUntilExpiry', 60);
    });

    it('should detect expired password', async () => {
      const lastChanged = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      const isExpired = passwordHistoryService.isPasswordExpired(lastChanged, 90);

      expect(isExpired).to.be.true;
    });

    it('should clean old entries', async () => {
      const history = [
        { hash: 'hash1', changedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
        { hash: 'hash2', changedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      ];

      const cleaned = passwordHistoryService.cleanOldEntries(history, 365);

      expect(cleaned).to.have.lengthOf(1);
      expect(cleaned[0].hash).to.equal('hash2');
    });

    it('should get password history statistics', async () => {
      const history = [
        { hash: 'hash1', changedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
        { hash: 'hash2', changedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        { hash: 'hash3', changedAt: new Date() }
      ];

      const stats = passwordHistoryService.getStats(history);

      expect(stats).to.have.property('totalPasswords', 3);
      expect(stats).to.have.property('oldestPassword');
      expect(stats).to.have.property('newestPassword');
      expect(stats).to.have.property('averageAge');
    });
  });

  describe('Password Requirements', () => {
    it('should provide requirements message', () => {
      const message = passwordHistoryService.getRequirementsMessage();

      expect(message).to.include('8 characters');
      expect(message).to.include('uppercase');
      expect(message).to.include('lowercase');
      expect(message).to.include('number');
      expect(message).to.include('special character');
      expect(message).to.include('last 5');
    });
  });
});
