/**
 * Cache service with in-memory fallback.
 * Uses Redis when available, otherwise uses a simple Map-based cache.
 */

const cache = new Map();
const ttlMap = new Map();

const memoryCache = {
  async get(key) {
    const expiry = ttlMap.get(key);
    if (expiry && Date.now() > expiry) {
      cache.delete(key);
      ttlMap.delete(key);
      return null;
    }
    return cache.get(key) || null;
  },

  async set(key, value, ttlSeconds = 3600) {
    cache.set(key, value);
    if (ttlSeconds) {
      ttlMap.set(key, Date.now() + ttlSeconds * 1000);
    }
    return true;
  },

  async del(key) {
    cache.delete(key);
    ttlMap.delete(key);
    return true;
  },

  async flush() {
    cache.clear();
    ttlMap.clear();
    return true;
  },

  async exists(key) {
    const value = await this.get(key);
    return value !== null;
  }
};

let cacheService = memoryCache;

// Try to use Redis if available
try {
  const redisClient = require('../config/redis');
  if (redisClient) {
    cacheService = {
      async get(key) {
        try {
          const value = await redisClient.get(key);
          return value ? JSON.parse(value) : null;
        } catch {
          return memoryCache.get(key);
        }
      },

      async set(key, value, ttlSeconds = 3600) {
        try {
          await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
          return true;
        } catch {
          return memoryCache.set(key, value, ttlSeconds);
        }
      },

      async del(key) {
        try {
          await redisClient.del(key);
          return true;
        } catch {
          return memoryCache.del(key);
        }
      },

      async flush() {
        try {
          await redisClient.flushAll();
          return true;
        } catch {
          return memoryCache.flush();
        }
      },

      async exists(key) {
        try {
          const result = await redisClient.exists(key);
          return result === 1;
        } catch {
          return memoryCache.exists(key);
        }
      }
    };
  }
} catch (err) {
  console.warn('Cache service using in-memory store:', err.message);
}

// Initialize method called on app start
cacheService.initialize = async () => {
  console.log('Cache service initialized');
  return true;
};

module.exports = cacheService;
