const { payRent } = require('../../controllers/payment.controller');
const { calculateLateFees } = require('../../utils/payments');

describe('Rent Payment Processing', () => {
  test('calculates late fees based on 10-day threshold', () => {
    // 10% fixed charge if paid after the 10th
    expect(calculateLateFees(10000, 31).amount).toBe(1000); // 10% of 10000 for >10 days late
    expect(calculateLateFees(10000, 10).amount).toBe(0); // No fee for 10 days late or less
    expect(calculateLateFees(10000, 5).amount).toBe(0); // No fee for 5 days late
  });

  test('allows ad-hoc payments of KES 1 and rejects zero/negative amounts', async () => {
    const mockReq = {
      body: { phone: '254712345678', amount: 1, propertyId: '123' },
      user: { id: 'tenant123' }
    };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await payRent(mockReq, mockRes);

    // Amount of 1 passes client-side validation; the controller will proceed
    // to context resolution (which fails here because property/lease is mocked,
    // but it proves the minimum is no longer 100).
    expect(mockRes.status).not.toHaveBeenCalledWith(400);

    const badReq = {
      body: { phone: '254712345678', amount: 0, propertyId: '123' },
      user: { id: 'tenant123' }
    };
    const badRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await payRent(badReq, badRes);
    expect(badRes.status).toHaveBeenCalledWith(400);
    expect(badRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Amount must be a whole number of at least KES 1' })
    );
  });
});
