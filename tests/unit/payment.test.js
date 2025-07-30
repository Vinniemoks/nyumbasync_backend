const { payRent } = require('../../controllers/payment.controller');
const { calculateLateFees } = require('../../utils/payments');

describe('Rent Payment Processing', () => {
  test('calculates late fees based on 10-day threshold', () => {
    // 10% fixed charge if paid after the 10th
    expect(calculateLateFees(10000, 31).amount).toBe(1000); // 10% of 10000 for >10 days late
    expect(calculateLateFees(10000, 10).amount).toBe(0); // No fee for 10 days late or less
    expect(calculateLateFees(10000, 5).amount).toBe(0); // No fee for 5 days late
  });

  test('rejects payments under KES 100', async () => {
    const mockReq = { 
      body: { phone: '254712345678', amount: 50, propertyId: '123' },
      user: { id: 'tenant123' }
    };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    
    await payRent(mockReq, mockRes);
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Amount must be whole KES ≥100' })
    );
  });
});
