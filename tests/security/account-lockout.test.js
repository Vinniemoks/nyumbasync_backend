/**
 * Account Lockout Tests
 * Tests brute force protection and account locking
 */

const request = require('supertest');
const { expect } = require('chai');
const User = require('../../models/user.model');
const accountLockoutService = require('../../services/account-lockout.service');

describe('Account Lockout Security Tests', () => {
  let app;
  let testUser;

  before(async () => {
    app = require('../../server');

    // Create test user
    testUser = await User.create({
      firstName: 'Lockout',
      lastName: 'Test',
      email: 'lockout@test.com',
      phone: '254712345682',
      password: 'TestPassword123!',
      role: 'tenant'
    });
  });

  after(async () => {
    await User.deleteOne({ email: 'lockout@test.com' });
  });

  afterEach(async () => {
    // Reset lockout after each test
    await accountLockoutService.resetAttempts('lockout@test.com');
  });

  describe('Failed Login Attempts', () => {
    it('should track failed login attempts', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'WrongPassword'
        })
        .expect(401);

      expect(res.body).to.have.property('error');
      expect(res.body).to.have.property('remainingAttempts');
      expect(res.body.remainingAttempts).to.equal(4);
    });

    it('should decrement remaining attempts', async () => {
      // First attempt
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'Wrong1'
        });

      // Second attempt
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'Wrong2'
        })
        .expect(401);

      expect(res.body.remainingAttempts).to.equal(3);
    });

    it('should lock account after 5 failed attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            identifier: 'lockout@test.com',
            password: `Wrong${i}`
          });
      }

      // 6th attempt should be locked
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'Wrong6'
        })
        .expect(423);

      expect(res.body).to.have.property('error', 'Account locked');
      expect(res.body).to.have.property('message');
      expect(res.body.message).to.include('30 minutes');
    });

    it('should prevent login when account is locked', async () => {
      // Lock the account
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            identifier: 'lockout@test.com',
            password: `Wrong${i}`
          });
      }

      // Try with correct password - should still be locked
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'TestPassword123!'
        })
        .expect(423);

      expect(res.body.error).to.equal('Account locked');
    });
  });

  describe('Successful Login', () => {
    it('should reset attempts on successful login', async () => {
      // Make 2 failed attempts
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'Wrong1'
        });

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'Wrong2'
        });

      // Successful login
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'lockout@test.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(res.body).to.have.property('success', true);

      // Check that attempts were reset
      const stats = await accountLockoutService.getStats('lockout@test.com');
      expect(stats.attempts).to.equal(0);
    });
  });

  describe('Lockout Service', () => {
    it('should check if account is locked', async () => {
      const status = await accountLockoutService.isLocked('lockout@test.com');
      expect(status).to.have.property('locked', false);
    });

    it('should record failed attempt', async () => {
      const result = await accountLockoutService.recordFailedAttempt('lockout@test.com');
      
      expect(result).to.have.property('locked', false);
      expect(result).to.have.property('attempts', 1);
      expect(result).to.have.property('remainingAttempts', 4);
    });

    it('should lock after max attempts', async () => {
      // Record 5 failed attempts
      let result;
      for (let i = 0; i < 5; i++) {
        result = await accountLockoutService.recordFailedAttempt('lockout@test.com');
      }

      expect(result).to.have.property('locked', true);
      expect(result).to.have.property('lockoutUntil');
    });

    it('should get lockout statistics', async () => {
      await accountLockoutService.recordFailedAttempt('lockout@test.com');
      await accountLockoutService.recordFailedAttempt('lockout@test.com');

      const stats = await accountLockoutService.getStats('lockout@test.com');

      expect(stats).to.have.property('attempts', 2);
      expect(stats).to.have.property('locked', false);
      expect(stats).to.have.property('remainingAttempts', 3);
    });

    it('should manually unlock account', async () => {
      // Lock the account
      for (let i = 0; i < 5; i++) {
        await accountLockoutService.recordFailedAttempt('lockout@test.com');
      }

      // Verify locked
      let status = await accountLockoutService.isLocked('lockout@test.com');
      expect(status.locked).to.be.true;

      // Unlock
      await accountLockoutService.unlockAccount('lockout@test.com');

      // Verify unlocked
      status = await accountLockoutService.isLocked('lockout@test.com');
      expect(status.locked).to.be.false;
    });

    it('should reset attempts', async () => {
      await accountLockoutService.recordFailedAttempt('lockout@test.com');
      await accountLockoutService.recordFailedAttempt('lockout@test.com');

      await accountLockoutService.resetAttempts('lockout@test.com');

      const stats = await accountLockoutService.getStats('lockout@test.com');
      expect(stats.attempts).to.equal(0);
    });
  });

  describe('User Enumeration Prevention', () => {
    it('should record attempts for non-existent users', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'nonexistent@test.com',
          password: 'SomePassword'
        })
        .expect(401);

      expect(res.body).to.have.property('error', 'Invalid credentials');
      
      // Verify attempt was recorded
      const stats = await accountLockoutService.getStats('nonexistent@test.com');
      expect(stats.attempts).to.be.greaterThan(0);
    });

    it('should lock non-existent user accounts', async () => {
      // Make 5 attempts with non-existent user
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            identifier: 'fake@test.com',
            password: `Wrong${i}`
          });
      }

      // 6th attempt should be locked
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'fake@test.com',
          password: 'Wrong6'
        })
        .expect(423);

      expect(res.body.error).to.equal('Account locked');
    });
  });

  describe('In-Memory Fallback', () => {
    it('should work without Redis', async () => {
      // This test verifies the in-memory fallback works
      const result = await accountLockoutService.recordFailedAttemptInMemory('test@example.com');
      
      expect(result).to.have.property('locked', false);
      expect(result).to.have.property('attempts', 1);
    });

    it('should lock using in-memory storage', async () => {
      let result;
      for (let i = 0; i < 5; i++) {
        result = await accountLockoutService.recordFailedAttemptInMemory('memory@test.com');
      }

      expect(result).to.have.property('locked', true);
    });

    it('should check lock status in memory', async () => {
      // Lock account
      for (let i = 0; i < 5; i++) {
        await accountLockoutService.recordFailedAttemptInMemory('memlock@test.com');
      }

      const status = await accountLockoutService.isLockedInMemory('memlock@test.com');
      expect(status.locked).to.be.true;
    });
  });
});
