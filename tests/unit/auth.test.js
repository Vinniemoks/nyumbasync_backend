const { validatePhone, validateNationalID, validateRentIncrease, validateKRA_PIN, validateLeaseDuration, validateMpesaAmount, validateCoordinates, validatePostalCode } = require('../../utils/kenyanValidators');
const { formatKenyanPhone } = require('../../utils/formatters');
const { verifyCode } = require('../../controllers/auth.controller'); 

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
    
    await verifyCode(mockReq, mockRes); // Changed to verifyCode
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Namba ya uthibitisho si sahihi au imeisha' }) // Updated error message
    );
  });
});
