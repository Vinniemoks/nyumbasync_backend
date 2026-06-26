/**
 * Local development boot: starts an in-memory MongoDB (no local mongod or
 * Atlas cluster needed) and then boots the API server against it.
 *
 *   node scripts/dev-server.js
 *
 * Data is ephemeral — for persistent local data, run a real MongoDB and set
 * MONGODB_URI in .env instead.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('nyumbasync');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production-1234567890';
  process.env.PORT = process.env.PORT || '3001';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  // Generous local limits; production values come from real env config.
  process.env.MAX_REQUESTS_PER_IP = process.env.MAX_REQUESTS_PER_IP || '100000';
  // Allow the local web/desktop/mobile dev clients.
  process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    || 'http://localhost:5000,http://localhost:3000,http://localhost:19006';
  process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5000';

  console.log(`[dev-server] in-memory MongoDB at ${process.env.MONGODB_URI}`);
  require('../server');
})().catch((err) => {
  console.error('[dev-server] failed to start:', err);
  process.exit(1);
});
