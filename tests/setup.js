const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();

let mongoServer;

module.exports = async () => {
  console.log('[Jest Global Setup] Starting...');

  // 1. Timezone Configuration
  process.env.TZ = 'Africa/Nairobi';
  console.log('✓ Timezone set to Africa/Nairobi');

  // 2. MongoDB Setup with forced binary version
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '6.0.12', // Stable version known to work
      os: {
        os: 'linux',
        dist: 'Ubuntu', // Force Ubuntu binary
        release: '22.04'
      }
    },
    instance: {
      dbName: 'jest-test-db'
    }
  });

  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
  });
  console.log('✓ MongoDB in-memory server started');

  global.__MONGOD__ = mongoServer;
  global.__MONGOOSE__ = mongoose;
};

module.exports.teardown = async () => {
  if (mongoServer) {
    await mongoose.disconnect();
    await mongoServer.stop();
    console.log('✓ MongoDB in-memory server stopped');
  }
};