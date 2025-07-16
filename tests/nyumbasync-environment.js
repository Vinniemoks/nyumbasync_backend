// tests/nyumbasync-environment.js

const NodeEnvironment = require('jest-environment-node');

class NyumbaSyncTestEnvironment extends NodeEnvironment {
  async setup() {
    process.env.TZ = 'Africa/Nairobi';
    await super.setup();
    console.log('[Test Environment] Timezone set.');
  }
}

module.exports = NyumbaSyncTestEnvironment;
