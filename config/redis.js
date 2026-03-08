/**
 * Redis client configuration with graceful fallback.
 * If Redis is not available, returns a null client so the app
 * can still start using in-memory session storage.
 */
let redisClient = null;

try {
  const redis = require('redis');
  const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  client.on('error', (err) => {
    console.warn('Redis connection error (falling back to memory store):', err.message);
  });

  client.on('connect', () => {
    console.log('Redis connected successfully');
  });

  // Connect asynchronously - don't block startup
  client.connect().catch((err) => {
    console.warn('Could not connect to Redis:', err.message);
  });

  redisClient = client;
} catch (err) {
  console.warn('Redis module not available, using memory session store:', err.message);
}

module.exports = redisClient;
