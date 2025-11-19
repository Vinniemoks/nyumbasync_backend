// Test setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only';

// Increase timeout for database operations
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  generateToken: (payload) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  },
  
  createTestUser: () => ({
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    phone: '254712345678',
    role: 'tenant',
    mpesaVerified: true
  }),
  
  createTestProperty: () => ({
    _id: '507f1f77bcf86cd799439012',
    name: 'Test Property',
    address: '123 Test St, Nairobi',
    type: 'apartment',
    units: 10,
    monthlyRent: 50000
  })
};
