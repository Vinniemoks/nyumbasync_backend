const mpesaService = require('../../services/mpesa.service');
const nock = require('nock');

// Mock the logger module
jest.mock('../../utils/logger', () => ({
  logTransaction: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Require the mocked logger after mocking
const { logTransaction, logger } = require('../../utils/logger');

process.env.MPESA_CONSUMER_KEY = 'mock_key';
process.env.MPESA_CONSUMER_SECRET = 'mock_secret';

nock.disableNetConnect();

describe('M-Pesa API Integration', () => {
  beforeEach(() => {
    // Clear mocks before each test
    logTransaction.mockClear();
    logger.info.mockClear();
    logger.error.mockClear();

    // Mock Safaricom auth endpoint
    nock('https://sandbox.safaricom.co.ke', {
      reqheaders: {
        'Authorization': 'Basic bW9ja19rZXk6bW9ja19zZWNyZXQ='
      }
    })
      .get('/oauth/v1/generate?grant_type=client_credentials')
      .reply(200, { access_token: 'test_token', expires_in: 3600 });
  });

  test('successfully initiates STK push', async () => {
    nock('https://sandbox.safaricom.co.ke')
      .post('/mpesa/stkpush/v1/processrequest')
      .reply(200, { 
        ResponseCode: '0',
        CheckoutRequestID: 'test123' 
      });
    
    const result = await mpesaService.initiateSTKPush(
      '254712345678',
      5000,
      'RENT_JAN_2024'
    );
    
    expect(result).toHaveProperty('CheckoutRequestID', 'test123');
    expect(logTransaction).toHaveBeenCalledWith(
      'MPESA_STK_PUSH',
      expect.objectContaining({ reference: 'RENT_JAN_2024' })
    );
  });

  test('handles M-Pesa downtime', async () => {
    nock('https://sandbox.safaricom.co.ke')
      .post('/mpesa/stkpush/v1/processrequest')
      .reply(503);
    
    await expect(
      mpesaService.initiateSTKPush('254712345678', 5000, 'RENT_JAN_2024')
    ).rejects.toThrow('MPESA_REQUEST_FAILED');
    expect(logTransaction).toHaveBeenCalledWith(
      'MPESA_STK_FAIL',
      expect.any(Object) // We expect an object containing error and payload
    );
  });
});
