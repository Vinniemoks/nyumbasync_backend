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
  
  verbose: true
};