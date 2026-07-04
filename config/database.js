require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Retry policy for unstable networks — NOT mongoose options; the driver
// rejects unknown connect options, so these must never be spread into
// mongoose.connect().
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const connectOptions = {
  bufferCommands: false, // Fail fast on connection issues
  socketTimeoutMS: 30000, // 30s timeout (longer for mobile networks)
};

const connectWithRetry = async () => {
  // SECURITY: never hardcode credentials here. The connection string must
  // come from the environment; refuse to start without it rather than
  // silently connecting to a baked-in cluster.
  const connectionString = process.env.MONGODB_URI;
  if (!connectionString) {
    logger.error('MONGODB_URI is not set. Configure it in .env (see .env.example).');
    process.exit(1);
  }

  // Awaitable retries: callers (scripts) must not proceed to queries until
  // the connection is actually up — bufferCommands is off.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(connectionString, {
        ...connectOptions,
        autoIndex: process.env.NODE_ENV !== 'production', // Indexing for dev
      });
      logger.info('Connected to MongoDB');
      return;
    } catch (err) {
      logger.error(`MongoDB connection failed: ${err.message}`);
      if (attempt === MAX_RETRIES) {
        process.exit(1);
      }
      logger.info(`Retrying connection (${MAX_RETRIES - attempt} left)...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

// NOTE: a global mongoose.set('timestamps', ...) override used to live here,
// but "timestamps" is not a valid global option in Mongoose 6 — it threw at
// module load, crashing every script that required this file. Schemas manage
// their own timestamps; nothing depended on the intended override.

module.exports = {
  connectWithRetry,
  mongoose,
  kenyaDBConfig: {
    autoCreate: true, // Auto-create collections
    readPreference: 'secondaryPreferred' // Better for East Africa region
  }
};
