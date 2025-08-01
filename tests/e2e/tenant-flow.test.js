require('dotenv').config({ path: './.env' }); // Ensure environment variables are loaded first with explicit path
console.log('JWT_SECRET after dotenv config:', process.env.JWT_SECRET); // Check if JWT_SECRET is loaded
const request = require('supertest');
let app;
const { createTestTenant, deleteTestTenant } = require('../helpers'); // Assuming you have a helper for deletion
const User = require('../../models/user.model'); // Import User model for teardown

describe('Tenant User Journey (Nairobi)', () => {
  let tenantToken;
  const testPhone = '254712345678'; // Example test phone number
  let testUserId; // To store the created user ID for teardown

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; // Set NODE_ENV to test
    // Explicitly set JWT_SECRET for the test environment as a fallback
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret'; 
    console.log('JWT_SECRET in beforeAll:', process.env.JWT_SECRET);
    console.log('MONGODB_URI in beforeAll:', process.env.MONGODB_URI); // Log MONGODB_URI
    app = require('../../app'); // Corrected import path

    // Register test tenant and get verification code
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: testPhone, role: 'tenant' });
    
    // Assuming the registration response includes the user ID or phone to find the user
    const user = await User.findOne({ phone: testPhone }).maxTimeMS(30000); // Increased timeout to 30 seconds
    testUserId = user._id; // Store user ID for teardown

    // Assuming the verification code is available in the response or database
    // For a real E2E test, you might need to interact with a test SMS service or database
    // For now, let's assume we can get the code from the user object (for testing purposes)
    const verificationCode = user.verificationCode; 

    // Verify code using the captured code
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ phone: testPhone, code: verificationCode });
    
    tenantToken = res.body.token;
    console.log('Generated Token:', tenantToken); // Log the generated token

  }, 120000); // Increased beforeAll timeout to 120 seconds

  afterAll(async () => {
    // Clean up the test tenant by ID or phone
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
      console.log(`Test tenant with ID ${testUserId} deleted.`);
    } else {
      // If user ID was not set (e.g., registration failed), try deleting by phone
      const userToDelete = await User.findOne({ phone: testPhone });
      if (userToDelete) {
        await User.findByIdAndDelete(userToDelete._id);
        console.log(`Test tenant with phone ${testPhone} deleted.`);
      }
    }
  }, 60000); // Increased afterAll timeout to 60 seconds

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
  }, 30000); // Increased test timeout to 30 seconds

  test('should fetch payment history', async () => {
    const historyRes = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${tenantToken}`);

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
  }, 30000); // Increased test timeout to 30 seconds
});
