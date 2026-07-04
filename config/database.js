require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Nairobi-specific connection settings
const config = {
  maxRetries: 5, // For unstable Kenyan networks
  retryDelay: 3000, // 3 seconds between retries
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

  try {
    await mongoose.connect(connectionString, {
      ...config,
      autoIndex: process.env.NODE_ENV !== 'production', // Indexing for dev
    });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    
    if (config.maxRetries > 0) {
      config.maxRetries--;
      logger.info(`Retrying connection (${config.maxRetries} left)...`);
      setTimeout(connectWithRetry, config.retryDelay);
    } else {
      process.exit(1);
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
