const { validatePhone, verifyMpesaCode } = require('../../controllers/auth.controller');
const { formatKenyanPhone } = require('../../utils/formatters');

describe('Kenyan Phone Authentication', () => {
  // Test valid Kenyan numbers
  test.each([
    ['254712345678', true],
    ['254112345678', true], // Airtel
    ['0712345678', true],   // Local format
    ['712345678', true],    // Short local
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
    
    await verifyMpesaCode(mockReq, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid or expired code' })
    );
  });
});
