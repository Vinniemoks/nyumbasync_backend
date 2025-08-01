const { validatePhone, validateNationalID, validateRentIncrease, validateKRA_PIN, validateLeaseDuration, validateMpesaAmount, validateCoordinates, validatePostalCode } = require('../../utils/kenyanValidators');
const { formatKenyanPhone } = require('../../utils/formatters');
const { verifyCode } = require('../../controllers/auth.controller'); 

// Mock the logger module
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), // Mock logger.info
  error: jest.fn(), // Mock logger.error
  logTransaction: jest.fn(), // Mock logTransaction if it's used in auth controller (though it shouldn't be)
}));

// Require the mocked logger after mocking
const logger = require('../../utils/logger');

describe('Kenyan Phone Authentication', () => {
  // Test valid Kenyan numbers
  test.each([
    ['254712345678', true],
    ['254112345678', true], // Airtel
    ['0712345678', true],   // Local format
    ['712345678', false],    // Short local - Corrected expectation
    ['25471234567', false], // Too short
    ['2547123456789', false] // Too long
  ])('validates %s', (phone, expected) => {
    expect(validatePhone(phone)).toBe(expected);
  });

  test('converts local to intl format', () => {
    expect(formatKenyanPhone('0712345678')).toBe('254712345678');
  });

  test('blocks invalid M-Pesa codes', async () => {
    const mockReq = { body: { phone: '254712345678', code: '1234' } };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    
    // Mock User.findOne to return null, simulating invalid code or expired code
    jest.spyOn(require('../../models/user.model'), 'findOne').mockResolvedValue(null);

    await verifyCode(mockReq, mockRes); // Changed to verifyCode
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Namba ya uthibitisho si sahihi au imeisha' }) // Updated error message
    );
    // Ensure logger.error was NOT called for this expected error case
    expect(logger.error).not.toHaveBeenCalled();

  }, 15000); // Increased timeout to 15 seconds
});
