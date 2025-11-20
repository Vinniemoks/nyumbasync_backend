/**
 * Token Blacklist Service
 * Manages JWT token blacklisting using Redis
 */

const logger = require('../utils/logger');

// In-memory fallback if Redis is not available
const inMemoryBlacklist = new Map();

let redis = null;
let useRedis = false;

/**
 * Initialize Redis connection
 */
const initializeRedis = async () => {
  try {
    // Only try to connect if REDIS_URL is configured
    if (!process.env.REDIS_URL) {
      logger.warn('Redis URL not configured, using in-memory token blacklist');
      return;
    }

    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 attempts, using in-memory fallback');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected for token blacklist');
      useRedis = true;
    });

    redis.on('error', (err) => {
      logger.error('Redis error:', err.message);
      useRedis = false;
    });

    // Test connection
    await redis.ping();
    useRedis = true;
  } catch (error) {
    logger.warn('Redis not available, using in-memory token blacklist:', error.message);
    useRedis = false;
  }
};

/**
 * Blacklist a token
 * @param {String} token - JWT token to blacklist
 * @param {Number} expiresIn - Token expiration time in seconds
 * @returns {Promise<Boolean>} - Success status
 */
const blacklistToken = async (token, expiresIn = 3600) => {
  try {
    if (useRedis && redis) {
      // Store in Redis with expiration
      await redis.setex(`blacklist:${token}`, expiresIn, '1');
      logger.info('Token blacklisted in Redis');
      return true;
    } else {
      // Fallback to in-memory storage
      const expiryTime = Date.now() + (expiresIn * 1000);
      inMemoryBlacklist.set(token, expiryTime);
      
      // Clean up expired tokens periodically
      cleanupExpiredTokens();
      
      logger.info('Token blacklisted in memory');
      return true;
    }
  } catch (error) {
    logger.error('Error blacklisting token:', error);
    
    // Fallback to in-memory
    const expiryTime = Date.now() + (expiresIn * 1000);
    inMemoryBlacklist.set(token, expiryTime);
    return true;
  }
};

/**
 * Check if a token is blacklisted
 * @param {String} token - JWT token to check
 * @returns {Promise<Boolean>} - True if blacklisted
 */
const isBlacklisted = async (token) => {
  try {
    if (useRedis && redis) {
      // Check Redis
      const result = await redis.exists(`blacklist:${token}`);
      return result === 1;
    } else {
      // Check in-memory storage
      const expiryTime = inMemoryBlacklist.get(token);
      
      if (!expiryTime) {
        return false;
      }
      
      // Check if token has expired
      if (Date.now() > expiryTime) {
        inMemoryBlacklist.delete(token);
        return false;
      }
      
      return true;
    }
  } catch (error) {
    logger.error('Error checking token blacklist:', error);
    
    // Fallback to in-memory check
    const expiryTime = inMemoryBlacklist.get(token);
    return expiryTime && Date.now() <= expiryTime;
  }
};

/**
 * Remove a token from blacklist (for testing purposes)
 * @param {String} token - JWT token to remove
 * @returns {Promise<Boolean>} - Success status
 */
const removeFromBlacklist = async (token) => {
  try {
    if (useRedis && redis) {
      await redis.del(`blacklist:${token}`);
    }
    inMemoryBlacklist.delete(token);
    return true;
  } catch (error) {
    logger.error('Error removing token from blacklist:', error);
    return false;
  }
};

/**
 * Clean up expired tokens from in-memory storage
 */
const cleanupExpiredTokens = () => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, expiryTime] of inMemoryBlacklist.entries()) {
    if (now > expiryTime) {
      inMemoryBlacklist.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`Cleaned up ${cleaned} expired tokens from memory`);
  }
};

/**
 * Get blacklist statistics
 * @returns {Promise<Object>} - Blacklist stats
 */
const getStats = async () => {
  try {
    if (useRedis && redis) {
      const keys = await redis.keys('blacklist:*');
      return {
        storage: 'redis',
        count: keys.length,
        connected: true
      };
    } else {
      // Clean up before counting
      cleanupExpiredTokens();
      
      return {
        storage: 'memory',
        count: inMemoryBlacklist.size,
        connected: false
      };
    }
  } catch (error) {
    logger.error('Error getting blacklist stats:', error);
    return {
      storage: 'memory',
      count: inMemoryBlacklist.size,
      connected: false,
      error: error.message
    };
  }
};

/**
 * Clear all blacklisted tokens (for testing)
 * @returns {Promise<Boolean>} - Success status
 */
const clearAll = async () => {
  try {
    if (useRedis && redis) {
      const keys = await redis.keys('blacklist:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
    inMemoryBlacklist.clear();
    logger.info('Token blacklist cleared');
    return true;
  } catch (error) {
    logger.error('Error clearing blacklist:', error);
    return false;
  }
};

// Initialize Redis on module load
initializeRedis().catch(err => {
  logger.warn('Failed to initialize Redis:', err.message);
});

// Periodic cleanup of in-memory tokens (every 5 minutes)
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

module.exports = {
  blacklistToken,
  isBlacklisted,
  removeFromBlacklist,
  getStats,
  clearAll,
  initializeRedis
};
