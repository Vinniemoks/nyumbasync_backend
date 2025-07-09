require('dotenv').config();

// Environment Validation
console.log('\n=== ENVIRONMENT CHECK ===');
console.log('Node Version:', process.version);
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set (default: development)');
console.log('PORT:', process.env.PORT || 'not set (default: 10000)');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '***configured***' : '❌ MISSING');

// Critical Configuration Check
if (!process.env.MONGODB_URI) {
  console.error('\nFATAL ERROR: MONGODB_URI environment variable is required');
  console.error('Please configure it in Render environment variables or .env file');
  process.exit(1);
}

// Server Startup
console.log('\n=== STARTING SERVER ===');
try {
  require('./server.js');
  console.log('Server initialized successfully');
} catch (error) {
  console.error('\nSERVER STARTUP FAILED:');
  console.error(error.message);
  console.error('\nStack Trace:');
  console.error(error.stack);
  process.exit(1);
}