const { TestEnvironment } = require('jest-environment-node');

class NyumbaSyncTestEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
  }

  async setup() {
    await super.setup();
    process.env.TZ = 'Africa/Nairobi';
    // Add any other setup code here
  }

  async teardown() {
    await super.teardown();
    // Add cleanup code if needed
  }

  getVmContext() {
    return super.getVmContext();
  }
}

module.exports = NyumbaSyncTestEnvironment;