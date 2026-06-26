# Backend Tests

## Run tests

```bash
npm test                # all tests
npm run test:auth       # auth only
npm run test:document   # documents only
npm run test:notification
npm run test:message
npm run test:coverage   # with coverage report
npm run test:security   # Mocha security tests
```

## Test environment

Tests use **MongoDB Memory Server** (in-memory, isolated) + **Jest** + **Supertest**.

Test-specific env (auto-loaded):
```env
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/nyumbasync_test
JWT_SECRET=test-jwt-secret
PORT=3002
```

## Test template

```javascript
const request = require('supertest');
const app = require('../server').app;

describe('Feature', () => {
  beforeEach(async () => {
    await Model.deleteMany({});
  });

  it('should do something', async () => {
    const res = await request(app)
      .get('/api/v1/endpoint')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
  });
});
```

## Rules

- One test suite per controller (`auth.test.js`, `payment.test.js`, etc.)
- Clear `beforeEach` cleanup so tests are independent
- Test both success and failure cases
- Aim for >80% coverage
