/**
 * Account Lockout Service
 * Prevents brute force attacks by locking accounts after failed login attempts
 */

const redis = require('./redis.service');

class AccountLockoutService {
  constructor() {
    this.maxAttempts = 5; // Maximum failed attempts before lockout
    this.lockoutDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
    this.attemptWindow = 15 * 60 * 1000; // 15 minutes window for attempts
    this.inMemoryStore = new Map(); // Fallback if Redis unavailable
  }

  /**
   * Get lockout key for user
   * @param {string} identifier - User email or ID
   * @returns {string} Redis key
   */
  getLockoutKey(identifier) {
    return `lockout:${identifier}`;
  }

  /**
   * Get attempts key for user
   * @param {string} identifier - User email or ID
   * @returns {string} Redis key
   */
  getAttemptsKey(identifier) {
    return `attempts:${identifier}`;
  }

  /**
   * Record failed login attempt
   * @param {string} identifier - User email or ID
   * @returns {Object} Lockout status
   */
  async recordFailedAttempt(identifier) {
    try {
      const key = this.getAttemptsKey(identifier);
      const lockoutKey = this.getLockoutKey(identifier);

      // Check if already locked
      const isLocked = await this.isLocked(identifier);
      if (isLocked.locked) {
        return isLocked;
      }

      // Try Redis first
      if (redis.isConnected()) {
        const attempts = await redis.incr(key);
        
        // Set expiry on first attempt
        if (attempts === 1) {
          await redis.expire(key, Math.floor(this.attemptWindow / 1000));
        }

        // Lock account if max attempts reached
        if (attempts >= this.maxAttempts) {
          await redis.setex(
            lockoutKey,
            Math.floor(this.lockoutDuration / 1000),
            Date.now().toString()
          );
          await redis.del(key); // Clear attempts counter

          return {
            locked: true,
            attempts: this.maxAttempts,
            remainingAttempts: 0,
            lockoutUntil: Date.now() + this.lockoutDuration,
            message: `Account locked for ${this.lockoutDuration / 60000} minutes due to too many failed attempts`
          };
        }

        return {
          locked: false,
          attempts,
          remainingAttempts: this.maxAttempts - attempts,
          message: `${this.maxAttempts - attempts} attempts remaining before lockout`
        };
      }

      // Fallback to in-memory
      return this.recordFailedAttemptInMemory(identifier);
    } catch (error) {
      console.error('Failed to record login attempt:', error);
      return this.recordFailedAttemptInMemory(identifier);
    }
  }

  /**
   * Record failed attempt in memory (fallback)
   * @param {string} identifier - User email or ID
   * @returns {Object} Lockout status
   */
  recordFailedAttemptInMemory(identifier) {
    const now = Date.now();
    const data = this.inMemoryStore.get(identifier) || {
      attempts: 0,
      firstAttempt: now,
      lockedUntil: null
    };

    // Check if locked
    if (data.lockedUntil && data.lockedUntil > now) {
      return {
        locked: true,
        attempts: this.maxAttempts,
        remainingAttempts: 0,
        lockoutUntil: data.lockedUntil,
        message: `Account locked until ${new Date(data.lockedUntil).toLocaleString()}`
      };
    }

    // Reset if attempt window expired
    if (now - data.firstAttempt > this.attemptWindow) {
      data.attempts = 0;
      data.firstAttempt = now;
      data.lockedUntil = null;
    }

    // Increment attempts
    data.attempts++;

    // Lock if max attempts reached
    if (data.attempts >= this.maxAttempts) {
      data.lockedUntil = now + this.lockoutDuration;
      this.inMemoryStore.set(identifier, data);

      return {
        locked: true,
        attempts: this.maxAttempts,
        remainingAttempts: 0,
        lockoutUntil: data.lockedUntil,
        message: `Account locked for ${this.lockoutDuration / 60000} minutes`
      };
    }

    this.inMemoryStore.set(identifier, data);

    return {
      locked: false,
      attempts: data.attempts,
      remainingAttempts: this.maxAttempts - data.attempts,
      message: `${this.maxAttempts - data.attempts} attempts remaining`
    };
  }

  /**
   * Check if account is locked
   * @param {string} identifier - User email or ID
   * @returns {Object} Lock status
   */
  async isLocked(identifier) {
    try {
      const lockoutKey = this.getLockoutKey(identifier);

      // Try Redis first
      if (redis.isConnected()) {
        const lockedAt = await redis.get(lockoutKey);
        if (lockedAt) {
          const ttl = await redis.ttl(lockoutKey);
          return {
            locked: true,
            lockoutUntil: Date.now() + (ttl * 1000),
            message: `Account locked for ${Math.ceil(ttl / 60)} more minutes`
          };
        }
        return { locked: false };
      }

      // Fallback to in-memory
      return this.isLockedInMemory(identifier);
    } catch (error) {
      console.error('Failed to check lockout status:', error);
      return this.isLockedInMemory(identifier);
    }
  }

  /**
   * Check if account is locked (in-memory fallback)
   * @param {string} identifier - User email or ID
   * @returns {Object} Lock status
   */
  isLockedInMemory(identifier) {
    const data = this.inMemoryStore.get(identifier);
    if (!data || !data.lockedUntil) {
      return { locked: false };
    }

    const now = Date.now();
    if (data.lockedUntil > now) {
      return {
        locked: true,
        lockoutUntil: data.lockedUntil,
        message: `Account locked until ${new Date(data.lockedUntil).toLocaleString()}`
      };
    }

    // Lockout expired, clear data
    this.inMemoryStore.delete(identifier);
    return { locked: false };
  }

  /**
   * Reset failed attempts (on successful login)
   * @param {string} identifier - User email or ID
   */
  async resetAttempts(identifier) {
    try {
      const key = this.getAttemptsKey(identifier);
      const lockoutKey = this.getLockoutKey(identifier);

      if (redis.isConnected()) {
        await redis.del(key);
        await redis.del(lockoutKey);
      }

      // Also clear in-memory
      this.inMemoryStore.delete(identifier);
    } catch (error) {
      console.error('Failed to reset attempts:', error);
      this.inMemoryStore.delete(identifier);
    }
  }

  /**
   * Manually unlock account (admin action)
   * @param {string} identifier - User email or ID
   */
  async unlockAccount(identifier) {
    try {
      const key = this.getAttemptsKey(identifier);
      const lockoutKey = this.getLockoutKey(identifier);

      if (redis.isConnected()) {
        await redis.del(key);
        await redis.del(lockoutKey);
      }

      this.inMemoryStore.delete(identifier);

      return {
        success: true,
        message: 'Account unlocked successfully'
      };
    } catch (error) {
      console.error('Failed to unlock account:', error);
      throw new Error('Failed to unlock account');
    }
  }

  /**
   * Get lockout statistics
   * @param {string} identifier - User email or ID
   * @returns {Object} Lockout statistics
   */
  async getStats(identifier) {
    try {
      const key = this.getAttemptsKey(identifier);
      const lockoutKey = this.getLockoutKey(identifier);

      if (redis.isConnected()) {
        const attempts = await redis.get(key) || 0;
        const locked = await redis.get(lockoutKey);
        const ttl = locked ? await redis.ttl(lockoutKey) : 0;

        return {
          attempts: parseInt(attempts),
          locked: !!locked,
          remainingAttempts: Math.max(0, this.maxAttempts - parseInt(attempts)),
          lockoutTimeRemaining: ttl > 0 ? ttl : 0
        };
      }

      // Fallback to in-memory
      const data = this.inMemoryStore.get(identifier);
      if (!data) {
        return {
          attempts: 0,
          locked: false,
          remainingAttempts: this.maxAttempts,
          lockoutTimeRemaining: 0
        };
      }

      const now = Date.now();
      const locked = data.lockedUntil && data.lockedUntil > now;

      return {
        attempts: data.attempts,
        locked,
        remainingAttempts: Math.max(0, this.maxAttempts - data.attempts),
        lockoutTimeRemaining: locked ? Math.floor((data.lockedUntil - now) / 1000) : 0
      };
    } catch (error) {
      console.error('Failed to get lockout stats:', error);
      return {
        attempts: 0,
        locked: false,
        remainingAttempts: this.maxAttempts,
        lockoutTimeRemaining: 0
      };
    }
  }

  /**
   * Clean up expired entries (for in-memory store)
   */
  cleanup() {
    const now = Date.now();
    for (const [identifier, data] of this.inMemoryStore.entries()) {
      if (data.lockedUntil && data.lockedUntil < now) {
        this.inMemoryStore.delete(identifier);
      } else if (now - data.firstAttempt > this.attemptWindow) {
        this.inMemoryStore.delete(identifier);
      }
    }
  }
}

// Create singleton instance
const accountLockoutService = new AccountLockoutService();

// Run cleanup every 5 minutes
setInterval(() => {
  accountLockoutService.cleanup();
}, 5 * 60 * 1000);

module.exports = accountLockoutService;
