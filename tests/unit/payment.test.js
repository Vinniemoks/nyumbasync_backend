const { processRentPayment } = require('../../controllers/payment.controller');
const { calculateLateFees } = require('../../utils/payments');

describe('Rent Payment Processing', () => {
  test('calculates late fees per Kenyan standards', () => {
    // 5% monthly cap test
    expect(calculateLateFees(10000, 31)).toBe(500); // 5% of rent
    expect(calculateLateFees(10000, 15)).toBe(750); // 0.05% * 15 days * 10000
  });

  test('rejects payments under KES 100', async () => {
    const mockReq = { 
      body: { phone: '254712345678', amount: 50, propertyId: '123' },
      user: { id: 'tenant123' }
    };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    
    await processRentPayment(mockReq, mockRes);
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Amount must be whole KES ≥100' })
    );
  });
});
