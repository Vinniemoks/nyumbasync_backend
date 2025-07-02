module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/tests/setup.js',
  globalTeardown: '<rootDir>/tests/teardown.js',
  // Longer timeouts for Kenyan network conditions
  testTimeout: 30000,
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './test-reports',
      filename: 'nairobi-test-report.html',
      includeConsoleLog: true
    }]
  ],
  // Focus on critical paths first
  testSequencer: '<rootDir>/tests/sequencer.js',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/queues/' // Tested separately
  ]
};
