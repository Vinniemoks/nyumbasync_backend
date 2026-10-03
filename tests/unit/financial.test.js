// The report adds expenses when asked (includeExpenses). The controller used the
// Expense model without importing it, so that path threw a ReferenceError and the
// caller got a 500.
jest.mock('../../models/payment.model', () => ({ find: jest.fn(async () => [{ amount: 1000 }]) }));
jest.mock('../../models/transaction.model', () => ({}));
jest.mock('../../models/lease.model', () => ({
  find: jest.fn(() => ({
    populate: async () => [{ status: 'active', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), monthlyRent: 1000 }],
  })),
}));
jest.mock('../../models/expense.model', () => ({ find: jest.fn(async () => [{ amount: 300 }]) }));
jest.mock('../../services/report.service', () => ({ generateReport: jest.fn(async (args) => args) }));
jest.mock('../../services/email.service', () => ({ sendEmail: jest.fn() }));
jest.mock('../../services/sms.service', () => ({ sendSMS: jest.fn() }));

const Expense = require('../../models/expense.model');
const { generateFinancialReport } = require('../../controllers/financial.controller');

const run = async (query) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await generateFinancialReport(
    { query: { propertyId: '64b7f0c2a1b2c3d4e5f60718', startDate: '2026-01-01', endDate: '2026-06-30', reportType: 'summary', ...query }, user: { role: 'admin', id: 'a1' } },
    res
  );
  return res;
};

describe('financial report', () => {
  beforeEach(() => jest.clearAllMocks());

  test('includes expenses and net income when includeExpenses is set', async () => {
    const res = await run({ includeExpenses: 'true' });
    expect(res.status).not.toHaveBeenCalled();
    const { report } = res.json.mock.calls[0][0];
    expect(Expense.find).toHaveBeenCalledTimes(1);
    expect(report.data.metrics.totalExpenses).toBe(300);
    expect(report.data.metrics.netIncome).toBe(700);
  });

  test('does not touch expenses otherwise', async () => {
    const res = await run({});
    const { report } = res.json.mock.calls[0][0];
    expect(Expense.find).not.toHaveBeenCalled();
    expect(report.data.metrics.totalExpenses).toBe(0);
  });
});
