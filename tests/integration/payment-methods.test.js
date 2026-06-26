const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../services/gateways', () => ({
  isConfigured: jest.fn(() => true),
  initializeTransaction: jest.fn(async ({ reference }) => ({
    authorizationUrl: `https://pay.test/${reference}`, reference, accessCode: 'ac_1'
  })),
  verifyTransaction: jest.fn(),
  verifyWebhookSignature: jest.fn(() => true)
}));
jest.mock('../../services/emailService', () => ({ sendPaymentConfirmation: jest.fn(async () => true) }));
jest.mock('../../services/sms.service', () => ({ sendSMS: jest.fn(async () => true) }));

const cardGateway = require('../../services/gateways');
const User = require('../../models/user.model');
const Invoice = require('../../models/invoice.model');
const Payment = require('../../models/payment.model');
const controller = require('../../controllers/payment.controller');

let mongoServer, tenant, landlord;

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((b) => { res.body = b; return res; });
  res.end = jest.fn(() => res);
  return res;
};

const makeInvoice = () => Invoice.create({
  tenant: tenant._id, landlord: landlord._id,
  property: new mongoose.Types.ObjectId(), lease: new mongoose.Types.ObjectId(),
  lineItems: [{ description: 'Rent', accountingCode: 'RENT', amount: 50000 }],
  periodCovered: { from: new Date(2026, 5, 1), to: new Date(2026, 5, 30) },
  dueDate: new Date(2026, 5, 5), status: 'issued'
});

describe('Bank + Card payment methods', () => {
  beforeAll(async () => {
    process.env.BANK_NAME = 'Equity';
    process.env.BANK_ACCOUNT_NAME = 'NyumbaSync';
    process.env.BANK_ACCOUNT_NUMBER = '0123456789';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    tenant = await User.create({ phone: '254712345678', firstName: 'Tess', lastName: 'T', email: 't@e.com', role: 'tenant', password: 'password123' });
    landlord = await User.create({ phone: '254733000111', firstName: 'Larry', lastName: 'L', email: 'l@e.com', role: 'landlord', password: 'password123' });
  });
  afterAll(async () => { await mongoose.disconnect(); await mongoServer.stop(); });
  afterEach(async () => { await Invoice.deleteMany({}); await Payment.deleteMany({}); jest.clearAllMocks(); });

  describe('Bank transfer (manual confirmation)', () => {
    test('initiate → submit-reference → landlord approve settles invoice', async () => {
      const invoice = await makeInvoice();

      const initRes = mockRes();
      await controller.initiateBankPayment({ body: { invoiceId: invoice._id }, user: { id: tenant._id } }, initRes);
      expect(initRes.statusCode).toBe(201);
      expect(initRes.body.reference).toMatch(/^BT/);
      expect(initRes.body.bank.accountNumber).toBe('0123456789');
      const paymentId = initRes.body.paymentId;

      const subRes = mockRes();
      await controller.submitBankReference({ body: { paymentId, reference: 'FT24XYZ' }, user: { id: tenant._id } }, subRes);
      expect(subRes.body.status).toBe('pending_verification');
      expect(require('../../services/sms.service').sendSMS).toHaveBeenCalled();

      const listRes = mockRes();
      await controller.listPendingVerification({ user: { id: landlord._id } }, listRes);
      expect(listRes.body).toHaveLength(1);

      const verRes = mockRes();
      await controller.verifyPayment({ params: { id: paymentId }, body: { action: 'approve' }, user: { id: landlord._id } }, verRes);
      expect(verRes.body.status).toBe('completed');
      expect((await Invoice.findById(invoice._id)).status).toBe('paid');
    });

    test('landlord reject marks it failed and leaves invoice open', async () => {
      const invoice = await makeInvoice();
      const initRes = mockRes();
      await controller.initiateBankPayment({ body: { invoiceId: invoice._id }, user: { id: tenant._id } }, initRes);
      const paymentId = initRes.body.paymentId;
      await controller.submitBankReference({ body: { paymentId, reference: 'FT24XYZ' }, user: { id: tenant._id } }, mockRes());

      const verRes = mockRes();
      await controller.verifyPayment({ params: { id: paymentId }, body: { action: 'reject', reason: 'not found' }, user: { id: landlord._id } }, verRes);
      expect(verRes.body.status).toBe('failed');
      expect((await Invoice.findById(invoice._id)).status).toBe('issued');
    });

    test('a landlord cannot verify another landlord\'s payment', async () => {
      const invoice = await makeInvoice();
      const initRes = mockRes();
      await controller.initiateBankPayment({ body: { invoiceId: invoice._id }, user: { id: tenant._id } }, initRes);
      await controller.submitBankReference({ body: { paymentId: initRes.body.paymentId, reference: 'FT1' }, user: { id: tenant._id } }, mockRes());

      const otherLandlord = new mongoose.Types.ObjectId();
      const verRes = mockRes();
      await controller.verifyPayment({ params: { id: initRes.body.paymentId }, body: { action: 'approve' }, user: { id: otherLandlord } }, verRes);
      expect(verRes.statusCode).toBe(403);
    });
  });

  describe('Card via gateway', () => {
    test('initiate returns the hosted checkout URL', async () => {
      const invoice = await makeInvoice();
      const res = mockRes();
      await controller.initiateCardPayment({ body: { invoiceId: invoice._id }, user: { id: tenant._id } }, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.authorizationUrl).toMatch(/^https:\/\/pay\.test\//);
      expect(cardGateway.initializeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ email: 't@e.com', amount: 50000 })
      );
      const payment = await Payment.findById(res.body.paymentId);
      expect(payment.channel).toBe('CARD');
      expect(payment.status).toBe('pending');
    });

    test('webhook charge.success settles the payment + invoice', async () => {
      const invoice = await makeInvoice();
      const initRes = mockRes();
      await controller.initiateCardPayment({ body: { invoiceId: invoice._id }, user: { id: tenant._id } }, initRes);
      const ref = initRes.body.reference;

      const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: ref } }));
      const res = mockRes();
      await controller.cardWebhook({ headers: { 'x-paystack-signature': 'sig' }, body: raw }, res);
      expect(res.statusCode).toBe(200);

      const payment = await Payment.findOne({ accountRef: ref });
      expect(payment.status).toBe('completed');
      expect((await Invoice.findById(invoice._id)).status).toBe('paid');
    });

    test('webhook with a bad signature is rejected', async () => {
      cardGateway.verifyWebhookSignature.mockReturnValueOnce(false);
      const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'CDx' } }));
      const res = mockRes();
      await controller.cardWebhook({ headers: { 'x-paystack-signature': 'bad' }, body: raw }, res);
      expect(res.statusCode).toBe(401);
    });
  });
});
