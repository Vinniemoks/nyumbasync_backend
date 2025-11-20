# NyumbaSync Backend Tests

## Overview

Comprehensive test suite for the NyumbaSync backend API covering authentication, documents, notifications, and messaging functionality.

## Test Structure

```
tests/
├── setup.js                 # Test configuration and utilities
├── auth.test.js            # Authentication tests (signup, login, logout)
├── document.test.js        # Document management tests
├── notification.test.js    # Notification system tests
├── message.test.js         # Messaging system tests
├── run-tests.sh           # Test runner script
└── README.md              # This file
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Specific Test Suites
```bash
# Authentication tests only
npm run test:auth

# Document tests only
npm run test:document

# Notification tests only
npm run test:notification

# Message tests only
npm run test:message
```

### Run Tests with Shell Script
```bash
chmod +x tests/run-tests.sh
./tests/run-tests.sh
```

## Test Coverage

### Authentication Tests (auth.test.js)
- ✅ User signup with valid data
- ✅ Signup validation (missing fields, duplicate email, weak passwords)
- ✅ User login with email/phone
- ✅ Login validation (invalid credentials)
- ✅ Get current user (authenticated)
- ✅ Token validation
- ✅ Logout functionality
- ✅ Password change

**Total: 15+ test cases**

### Document Tests (document.test.js)
- ✅ Get all documents
- ✅ Get document by ID
- ✅ Upload document with file
- ✅ Upload validation
- ✅ Delete own document
- ✅ Authorization checks
- ✅ Get document categories
- ✅ Tenant-specific documents

**Total: 12+ test cases**

### Notification Tests (notification.test.js)
- ✅ Get all notifications
- ✅ Get unread count
- ✅ Mark notification as read
- ✅ Mark all as read
- ✅ Delete notification
- ✅ Get notification preferences
- ✅ Update notification preferences
- ✅ Authorization checks

**Total: 10+ test cases**

### Message Tests (message.test.js)
- ✅ Send message and create conversation
- ✅ Send message to existing conversation
- ✅ Get user conversations
- ✅ Get messages in conversation
- ✅ Pagination support
- ✅ Mark messages as read
- ✅ Get unread count
- ✅ Create conversation
- ✅ Delete message
- ✅ Tenant messages

**Total: 12+ test cases**

## Test Environment

Tests use:
- **MongoDB Memory Server** - In-memory MongoDB for isolated testing
- **Supertest** - HTTP assertions
- **Jest** - Test framework
- **Babel** - ES6+ support

## Configuration

### Environment Variables (.env.test)
```env
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/nyumbasync_test
JWT_SECRET=test-jwt-secret
PORT=3002
```

### Jest Configuration (jest.config.js)
- Test environment: Node.js
- Coverage directory: `coverage/`
- Test timeout: 10 seconds
- Run tests serially (--runInBand)

## Writing New Tests

### Test Template
```javascript
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const Model = require('../models/model.model');

let mongoServer;
let token;
let userId;

describe('Feature Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Model.deleteMany({});
    // Setup test data
  });

  describe('GET /api/v1/endpoint', () => {
    it('should do something', async () => {
      const response = await request(app)
        .get('/api/v1/endpoint')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('property');
    });
  });
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Clear database before each test
3. **Descriptive**: Use clear test descriptions
4. **Assertions**: Test both success and failure cases
5. **Coverage**: Aim for >80% code coverage
6. **Speed**: Keep tests fast (<10s per suite)

## Common Issues

### MongoDB Connection Issues
```bash
# Make sure MongoDB is not running on test port
sudo lsof -i :27017
```

### Port Already in Use
```bash
# Kill process on port 3002
lsof -ti:3002 | xargs kill -9
```

### Test Timeout
```javascript
// Increase timeout for slow tests
jest.setTimeout(15000);
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Statements | TBD | >80% |
| Branches | TBD | >75% |
| Functions | TBD | >80% |
| Lines | TBD | >80% |

## Next Steps

### Additional Tests Needed
- [ ] Property controller tests
- [ ] Payment controller tests
- [ ] Maintenance controller tests
- [ ] Move-out controller tests
- [ ] Deposit refund tests
- [ ] Vendor controller tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance tests
- [ ] Security tests

### Test Improvements
- [ ] Add more edge cases
- [ ] Test error scenarios
- [ ] Add load testing
- [ ] Add security testing
- [ ] Improve coverage to >90%

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Testing Best Practices](https://testingjavascript.com/)

## Support

For issues or questions about tests:
1. Check test output for error messages
2. Review test logs in console
3. Verify environment configuration
4. Check database connection

---

**Last Updated:** November 19, 2025  
**Test Coverage:** 49+ test cases  
**Status:** Ready for CI/CD
