require('dotenv').config();
console.log(process.env.JWT_SECRET);
const request = require('supertest');
let app;
const { createTestTenant } = require('../helpers');

describe('Tenant User Journey (Nairobi)', () => {
  let tenantToken;
  // Define testPhone here or within a beforeAll/beforeEach
  const testPhone = '254712345678'; // Example test phone number

  beforeAll(async () => {
    process.env.JWT_SECRET = '12345678'
    app = require('../../app'); // Corrected import path

    // Register test tenant
    await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: testPhone, role: 'tenant' });
    
    // Verify code (mock)
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ phone: testPhone, code: '1234' });
    
    tenantToken = res.body.token;
  }, 10000); // Increased timeout to 10 seconds

  // Place your test cases inside this describe block
  test('should complete rent payment flow', async () => {
    // 1. Search for properties
    const searchRes = await request(app)
      .get('/api/v1/properties?lng=36.8&lat=-1.3&maxRent=50000')
      .set('Authorization', `Bearer ${tenantToken}`);
    
    expect(searchRes.status).toBe(200);
    const [property] = searchRes.body;

    // 2. Initiate payment
    const paymentRes = await request(app)
      .post('/api/v1/payments/mpesa')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        phone: testPhone,
        amount: property.rent,
        propertyId: property._id
      });
    
    expect(paymentRes.status).toBe(202);

    // 3. Simulate M-Pesa callback
    const callbackRes = await request(app)
      .post('/api/v1/payments/mpesa-callback')
      .send(require('../mocks/mpesa.mock')(property.rent, testPhone));
    
    expect(callbackRes.status).toBe(200);
  });

  test('should fetch payment history', async () => {
    const historyRes = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${tenantToken}`);

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
  });
});
