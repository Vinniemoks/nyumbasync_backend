module.exports = { 
  testEnvironment: 'node',
  
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  
  transformIgnorePatterns: ['/node_modules/'],
  
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  
  moduleFileExtensions: ['js', 'json', 'node'],
  
  coverageDirectory: 'coverage',
  
  collectCoverageFrom: [
    'controllers/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    'middlewares/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  testTimeout: 10000,

  // The suite leaks open handles (per-suite Mongo connections / mongod
  // processes that aren't all released), which previously hung the runner so it
  // got killed before printing or writing its summary. forceExit lets every
  // suite run to completion and emit a reliable scoreboard, then exits.
  // (Run with --detectOpenHandles to hunt the leaks themselves.)
  forceExit: true,

  verbose: true
};