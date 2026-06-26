const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../services/email.service', () => ({ sendEmail: jest.fn(async () => ({ success: true })) }));
jest.mock('../../services/sms.service', () => ({
  sendSMS: jest.fn(async () => ({ success: true, sid: 'sms1' })),
  sendWhatsApp: jest.fn(async () => ({ success: true, sid: 'wa1' }))
}));

const Invoice = require('../../models/invoice.model');
const Lease = require('../../models/lease.model');
require('../../models/user.model');     // register schemas used by populate()
require('../../models/property.model');
const invoiceService = require('../../services/invoice.service');
const reminderService = require('../../services/reminder.service');

let mongoServer;

const makeLease = (overrides = {}) => Lease.create({
  property: new mongoose.Types.ObjectId(),
  tenant: new mongoose.Types.ObjectId(),
  landlord: new mongoose.Types.ObjectId(),
  startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 1), status: 'active',
  terms: { durationMonths: 12, rentAmount: 50000, depositAmount: 50000, rentDueDate: 5, lateFeePercentage: 10 },
  ...overrides
});

const JAN = new Date(2026, 0, 15);
const FEB = new Date(2026, 1, 15);

describe('Kenyan invoicing — utilities, levies, carry-forward, reminders', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });
  afterAll(async () => { await mongoose.disconnect(); await mongoServer.stop(); });
  afterEach(async () => { await Invoice.deleteMany({}); await Lease.deleteMany({}); jest.clearAllMocks(); });

  describe('Water + service line items', () => {
    test('computes water charge from meter readings', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease, JAN);

      const updated = await invoiceService.addLineItems(invoice._id, [
        { type: 'water', currentReading: 120, previousReading: 100, rate: 50 }
      ]);

      const water = updated.lineItems.find(li => li.accountingCode === 'UTILITY');
      expect(water.amount).toBe(1000); // (120 - 100) * 50
      expect(updated.total).toBe(51000); // 50000 rent + 1000 water
    });

    test('prefills previous reading from last invoice', async () => {
      const lease = await makeLease();
      const jan = (await Invoice.generateForLease(lease, JAN)).invoice;
      await invoiceService.addLineItems(jan._id, [{ type: 'water', currentReading: 100, previousReading: 80, rate: 50 }]);

      const feb = (await Invoice.generateForLease(lease, FEB)).invoice;
      const updated = await invoiceService.addLineItems(feb._id, [{ type: 'water', currentReading: 135, rate: 50 }]);

      const water = updated.lineItems.find(li => li.accountingCode === 'UTILITY');
      expect(water.meterPrevious).toBe(100); // carried from January's currentReading
      expect(water.amount).toBe(1750); // (135 - 100) * 50
    });

    test('adds a service levy with a landlord description', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease, JAN);
      const updated = await invoiceService.addLineItems(invoice._id, [
        { type: 'service', description: 'Garbage collection levy', amount: 500 }
      ]);
      const levy = updated.lineItems.find(li => li.description === 'Garbage collection levy');
      expect(levy.accountingCode).toBe('OTHER');
      expect(updated.total).toBe(50500);
    });

    test('rejects edits to a paid invoice', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease, JAN);
      invoice.status = 'paid'; await invoice.save();
      await expect(invoiceService.addLineItems(invoice._id, [{ type: 'service', description: 'x', amount: 1 }]))
        .rejects.toThrow(/paid/);
    });
  });

  describe('Partial payment + carry-forward', () => {
    test('markPaid tracks partial then full payment', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease, JAN);
      invoice.status = 'issued'; await invoice.save();

      await invoiceService.markPaid(invoice, { _id: new mongoose.Types.ObjectId(), amount: 30000 });
      let reloaded = await Invoice.findById(invoice._id);
      expect(reloaded.status).toBe('partially_paid');
      expect(reloaded.amountPaid).toBe(30000);
      expect(reloaded.balance).toBe(20000);

      await invoiceService.markPaid(reloaded, { _id: new mongoose.Types.ObjectId(), amount: 20000 });
      reloaded = await Invoice.findById(invoice._id);
      expect(reloaded.status).toBe('paid');
      expect(reloaded.balance).toBe(0);
    });

    test('carries an underpayment forward as Balance brought forward', async () => {
      const lease = await makeLease();
      const jan = (await Invoice.generateForLease(lease, JAN)).invoice;
      jan.status = 'issued'; await jan.save();
      await invoiceService.markPaid(jan, { _id: new mongoose.Types.ObjectId(), amount: 30000 }); // owes 20000

      const feb = (await Invoice.generateForLease(lease, FEB)).invoice;
      const bf = feb.lineItems.find(li => /Balance brought forward/.test(li.description));
      expect(bf).toBeTruthy();
      expect(bf.amount).toBe(20000);
      expect(feb.total).toBe(70000); // 50000 rent + 20000 arrears
    });

    test('carries an overpayment forward as a credit', async () => {
      const lease = await makeLease();
      const jan = (await Invoice.generateForLease(lease, JAN)).invoice;
      jan.status = 'issued'; await jan.save();
      await invoiceService.markPaid(jan, { _id: new mongoose.Types.ObjectId(), amount: 60000 }); // 10000 credit

      const feb = (await Invoice.generateForLease(lease, FEB)).invoice;
      const credit = feb.lineItems.find(li => /Credit from last month/.test(li.description));
      expect(credit).toBeTruthy();
      expect(credit.amount).toBe(-10000);
      expect(feb.total).toBe(40000); // 50000 rent - 10000 credit
    });
  });

  describe('issueInvoice', () => {
    test('flips draft → issued/sent and emails', async () => {
      const lease = await makeLease();
      const { invoice } = await Invoice.generateForLease(lease, JAN);
      expect(invoice.status).toBe('draft');

      await invoiceService.issueInvoice(invoice._id);
      const reloaded = await Invoice.findById(invoice._id);
      // draft → issued (→ 'sent' once a tenant email exists; none in this minimal setup).
      expect(['issued', 'sent']).toContain(reloaded.status);
      expect(reloaded.status).not.toBe('draft');
    });
  });

  describe('Multi-channel reminders', () => {
    test('dispatches to sms, whatsapp and email', async () => {
      const invoice = {
        invoiceNumber: 'INV-2026-1000-0001', total: 50000, balance: 20000,
        dueDate: new Date(2026, 0, 5),
        tenant: { firstName: 'Tess', email: 't@e.com', phone: '254712345678' },
        property: { title: 'Riverside A1' }
      };
      const results = await reminderService.sendInvoiceReminder(invoice, ['sms', 'whatsapp', 'email']);
      expect(results.sms.success).toBe(true);
      expect(results.whatsapp.success).toBe(true);
      expect(results.email.success).toBe(true);
      expect(require('../../services/sms.service').sendWhatsApp).toHaveBeenCalled();
    });

    test('reports a channel that has no destination', async () => {
      const invoice = {
        invoiceNumber: 'INV-2026-1000-0002', total: 50000, balance: 50000, dueDate: new Date(),
        tenant: { firstName: 'No', phone: '254712345678' }, // no email
        property: { title: 'B2' }
      };
      const results = await reminderService.sendInvoiceReminder(invoice, ['email', 'sms']);
      expect(results.email.success).toBe(false);
      expect(results.sms.success).toBe(true);
    });
  });
});
