/**
 * Simple server startup for performance testing
 * Bypasses route validation
 */

require('dotenv').config();

// Set environment to production to avoid test-specific behavior
process.env.NODE_ENV = 'production';

// Start the server
const app = require('./server');

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`\n🚀 Performance test server running on port ${PORT}`);
  console.log(`📊 Ready for performance testing!`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health\n`);
});
