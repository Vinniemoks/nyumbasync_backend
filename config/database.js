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
  const connectionString = process.env.MONGODB_URI || 
    'mongodb://localhost:27017/nyumbasync';

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

// Kenyan timezone configuration
mongoose.set('timestamps', {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  currentTime: () => new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
});

module.exports = {
  connectWithRetry,
  mongoose,
  kenyaDBConfig: {
    autoCreate: true, // Auto-create collections
    readPreference: 'secondaryPreferred' // Better for East Africa region
  }
};
