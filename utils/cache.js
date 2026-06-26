/**
 * In-process cache utilities backed by memory-cache.
 *
 * cacheManager: async get/set/del with TTL in seconds (the interface the
 * controllers use). For multi-instance deployments swap this for Redis —
 * the async signatures are already compatible.
 */

const cache = require('memory-cache');

const cacheManager = {
  async get(key) {
    return cache.get(key);
  },

  async set(key, value, ttlSeconds) {
    return cache.put(key, value, ttlSeconds ? ttlSeconds * 1000 : undefined);
  },

  async del(key) {
    return cache.del(key);
  },

  async clear() {
    return cache.clear();
  },
};

module.exports = { cache, cacheManager };
