module.exports = { 
  testEnvironment: './tests/nyumbasync-environment.js', 
  
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  
  transformIgnorePatterns: ['/node_modules/'],
  
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  
  moduleFileExtensions: ['js', 'json', 'node'],
};