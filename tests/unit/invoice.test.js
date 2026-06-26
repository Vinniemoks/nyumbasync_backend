const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Invoice = require('../../models/invoice.model');
const Lease = require('../../models/lease.model');
const invoiceService = require('../../services/invoice.service');

let mongoServer;

const makeLease = async (overrides = {}) => {
  const now = new Date();
  return Lease.create({
    property: new mongoose.Types.ObjectId(),
    tenant: new mongoose.Types.ObjectId(),
    landlord: new mongoose.Types.ObjectId(),
    startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    endDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
    status: 'active',
    terms: {
      durationMonths: 12,
      rentAmount: 50000,
      depositAmount: 50000,
      rentDueDate: 5,
      lateFeePercentage: 10,
    },
    ...overrides,
  });
};

describe('Invoice model & service', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Invoice.deleteMany({});
    await Lease.deleteMany({});
  });

  describe('generateForLease', () => {
    test('creates one invoice for the billing month', async () => {
      const lease = await makeLease();
      const { invoice, created } = await Invoice.generateForLease(lease);

      expect(created).toBe(true);
      expect(invoice.total).toBe(50000);
      expect(invoice.subtotal).toBe(50000);
      // Generated as a draft for the landlord to add utilities/levies before issuing.
      expect(invoice.status).toBe('draft');
      expect(invoice.lineItems).toHaveLength(1);
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}-/);
      // Due date should land on the lease's rentDueDate (day 5).
      expect(new Date(invoice.dueDate).getDate()).toBe(5);
    });

    test('is idempotent — re-running the same month makes no duplicate', async () => {
      const lease = await makeLease();
      const first = await Invoice.generateForLease(lease);
      const second = await Invoice.generateForLease(lease);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(String(second.invoice._id)).toBe(String(first.invoice._id));

      const count = await Invoice.countDocuments({ lease: lease._id });
      expect(count).toBe(1);
    });
  });

  describe('generateMonthlyInvoices', () => {
    test('reports created vs skipped across active leases', async () => {
      await makeLease();
      await makeLease();

      const first = await invoiceService.generateMonthlyInvoices();
      expect(first.created).toBe(2);
      expect(first.skipped).toBe(0);

      const second = await invoiceService.generateMonthlyInvoices();
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(2);
    });

    test('ignores non-active leases', async () => {
      await makeLease({ status: 'expired' });
      const result = await invoiceService.generateMonthlyInvoices();
      expect(result.created).toBe(0);
    });
  });

  describe('applyLateFees', () => {
    test('adds a one-time penalty and flags overdue', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease);

      // Late fees only apply to issued bills — issue it, then force it overdue.
      invoice.status = 'issued';
      invoice.dueDate = new Date(Date.now() - 3 * 86400000);
      await invoice.save();

      const firstRun = await invoiceService.applyLateFees();
      expect(firstRun.penalized).toBe(1);

      const reloaded = await Invoice.findById(invoice._id);
      expect(reloaded.status).toBe('overdue');
      expect(reloaded.lateFeeApplied).toBe(true);
      expect(reloaded.lateFee).toBe(5000); // 10% of 50,000
      expect(reloaded.total).toBe(55000);
      expect(reloaded.lineItems.some(li => li.accountingCode === 'PENALTY')).toBe(true);

      // Running again must not double-charge.
      await invoiceService.applyLateFees();
      const again = await Invoice.findById(invoice._id);
      expect(again.lateFee).toBe(5000);
      expect(again.total).toBe(55000);
      expect(again.lineItems.filter(li => li.accountingCode === 'PENALTY')).toHaveLength(1);
    });
  });

  describe('markPaid', () => {
    test('settles an invoice and links the payment', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease);
      const fakePayment = { _id: new mongoose.Types.ObjectId() };

      await invoiceService.markPaid(invoice, fakePayment);

      const reloaded = await Invoice.findById(invoice._id);
      expect(reloaded.status).toBe('paid');
      expect(reloaded.paidAt).toBeTruthy();
      expect(String(reloaded.payment)).toBe(String(fakePayment._id));
    });
  });

  describe('settleForPayment (invoiceId binding)', () => {
    // Two open invoices for the same tenant+property, different months.
    const makeTwoOpen = async () => {
      const lease = await makeLease();
      const base = {
        tenant: lease.tenant, landlord: lease.landlord, property: lease.property, lease: lease._id,
        lineItems: [{ description: 'Rent', accountingCode: 'RENT', amount: 50000 }],
      };
      const older = await Invoice.create({
        ...base,
        periodCovered: { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
        dueDate: new Date(2026, 0, 5),
      });
      const newer = await Invoice.create({
        ...base,
        periodCovered: { from: new Date(2026, 1, 1), to: new Date(2026, 1, 28) },
        dueDate: new Date(2026, 1, 5),
      });
      return { lease, older, newer };
    };

    test('settles the EXACT invoice when invoiceId is given, not the oldest', async () => {
      const { lease, older, newer } = await makeTwoOpen();
      const payment = { _id: new mongoose.Types.ObjectId() };

      const settled = await invoiceService.settleForPayment({
        invoiceId: newer._id, tenant: lease.tenant, property: lease.property, payment,
      });

      expect(String(settled._id)).toBe(String(newer._id));
      expect((await Invoice.findById(newer._id)).status).toBe('paid');
      // The older invoice must remain open — binding was explicit.
      expect((await Invoice.findById(older._id)).status).toBe('issued');
    });

    test('falls back to the oldest open invoice when no invoiceId', async () => {
      const { lease, older, newer } = await makeTwoOpen();

      const settled = await invoiceService.settleForPayment({
        tenant: lease.tenant, property: lease.property, payment: { _id: new mongoose.Types.ObjectId() },
      });

      expect(String(settled._id)).toBe(String(older._id));
      expect((await Invoice.findById(older._id)).status).toBe('paid');
      expect((await Invoice.findById(newer._id)).status).toBe('issued');
    });

    test('does not re-settle an already paid invoice', async () => {
      const { lease, newer } = await makeTwoOpen();
      const firstPayment = { _id: new mongoose.Types.ObjectId() };
      await invoiceService.settleForPayment({ invoiceId: newer._id, payment: firstPayment });

      const secondPayment = { _id: new mongoose.Types.ObjectId() };
      const result = await invoiceService.settleForPayment({ invoiceId: newer._id, payment: secondPayment });

      // Returns the invoice but leaves the original payment link intact.
      expect(String(result._id)).toBe(String(newer._id));
      expect(String((await Invoice.findById(newer._id)).payment)).toBe(String(firstPayment._id));
    });

    test('returns null when nothing matches', async () => {
      const result = await invoiceService.settleForPayment({
        tenant: new mongoose.Types.ObjectId(), property: new mongoose.Types.ObjectId(),
      });
      expect(result).toBeNull();
    });
  });
});
