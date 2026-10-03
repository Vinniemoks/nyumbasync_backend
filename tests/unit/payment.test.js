// The property lookup is replaced so these tests never need a database.
jest.mock('../../models/property.model', () => ({
  findById: jest.fn(async () => ({ landlord: 'landlord123' })),
}));
jest.mock('../../services/mpesa.service', () => ({
  ...jest.requireActual('../../services/mpesa.service'),
  isConfigured: jest.fn(() => false),
}));

const { payRent } = require('../../controllers/payment.controller');
const { calculateLateFees } = require('../../utils/payments');

describe('Rent Payment Processing', () => {
  test('calculates late fees based on 10-day threshold', () => {
    // 10% fixed charge if paid after the 10th
    expect(calculateLateFees(10000, 31).amount).toBe(1000); // 10% of 10000 for >10 days late
    expect(calculateLateFees(10000, 10).amount).toBe(0); // No fee for 10 days late or less
    expect(calculateLateFees(10000, 5).amount).toBe(0); // No fee for 5 days late
  });

  const PROPERTY_ID = '64b7f0c2a1b2c3d4e5f60718';
  const run = async (body) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await payRent({ body: { phone: '254712345678', propertyId: PROPERTY_ID, ...body }, user: { id: 'tenant123' } }, res);
    return res;
  };

  test('allows ad-hoc payments of KES 1 and rejects zero/negative amounts', async () => {
    // KES 1 passes validation and goes on to the payment step, which stops at 503
    // here because M-Pesa isn't configured in tests. (Nothing is sent or saved.)
    const ok = await run({ amount: 1 });
    expect(ok.status).not.toHaveBeenCalledWith(400);
    expect(ok.status).toHaveBeenCalledWith(503);

    for (const amount of [0, -5]) {
      const bad = await run({ amount });
      expect(bad.status).toHaveBeenCalledWith(400);
      expect(bad.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Amount must be a whole number of at least KES 1' })
      );
    }
  });

  test('rejects a property id that is not a valid identifier', async () => {
    const res = await run({ amount: 500, propertyId: '123' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid property identifier' }));
  });
});
