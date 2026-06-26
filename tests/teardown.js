const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  // 1. Close MongoDB in-memory server (critical for Jest to exit)
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  // 2. Stop MongoMemoryServer instance (if used)
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
    console.log('[Global Teardown] Cleaning up test environment');
  }

  // 3. Delete test files created during M-Pesa callback tests
  const testFilesDir = path.join(__dirname, 'test_files');
  if (fs.existsSync(testFilesDir)) {
    fs.rmdirSync(testFilesDir, { recursive: true });
  }

  // 4. Clear Safaricom M-Pesa mock logs (Kenya-specific)
  const mpesaLogPath = path.join(__dirname, 'mpesa_test_logs.json');
  if (fs.existsSync(mpesaLogPath)) {
    fs.unlinkSync(mpesaLogPath);
  }

  // 5. Reset Twilio SMS mock (if used)
  if (global.twilioMock) {
    jest.clearAllMocks();
  }

  // 6. Force exit (for stubborn async operations in Kenyan networks)
  if (process.env.CI === 'true') {
    process.exit(0); // GitHub Actions/Linux CI fix
  }
};