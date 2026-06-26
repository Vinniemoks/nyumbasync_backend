const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../services/mpesa.service', () => ({
  isConfigured: jest.fn(() => true),
  isReversalConfigured: jest.fn(() => true),
  initiateSTKPush: jest.fn(async () => ({ CheckoutRequestID: 'ws_CO_X' })),
  reverseTransaction: jest.fn(async () => ({ ConversationID: 'AG_REV_1' })),
  registerC2BUrls: jest.fn(async () => ({ ResponseDescription: 'success' }))
}));
jest.mock('../../services/emailService', () => ({ sendPaymentConfirmation: jest.fn(async () => true) }));
jest.mock('../../services/sms.service', () => ({ sendSMS: jest.fn(async () => true) }));

const mpesaService = require('../../services/mpesa.service');
const User = require('../../models/user.model');
const Invoice = require('../../models/invoice.model');
const Payment = require('../../models/payment.model');
const controller = require('../../controllers/payment.controller');
const { expireStaleIntents } = require('../../jobs/payments.scheduler');

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

// Issue a Paybill fallback for an invoice and return { payment, accountRef }.
const issueFallback = async (invoice) => {
  const res = mockRes();
  await controller.requestPaybillFallback(
    { body: { invoiceId: invoice._id, phoneNumber: '0712345678' }, user: { id: tenant._id } },
    res
  );
  return { res, payment: await Payment.findById(res.body.paymentId), accountRef: res.body.accountRef };
};

const confirmation = (accountRef, { receipt = 'QC2B123456', amount = 50000 } = {}) => ({
  body: { BillRefNumber: accountRef, TransID: receipt, TransAmount: amount, MSISDN: 254712345678, TransTime: 20260620140500 }
});

describe('M-Pesa C2B Paybill fallback', () => {
  beforeAll(async () => {
    process.env.MPESA_C2B_SHORTCODE = '4109673';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    tenant = await User.create({ phone: '254712345678', firstName: 'Tess', lastName: 'T', email: 't@e.com', role: 'tenant', password: 'password123' });
    landlord = await User.create({ phone: '254733000111', firstName: 'Larry', lastName: 'L', email: 'l@e.com', role: 'landlord', password: 'password123' });
  });
  afterAll(async () => { await mongoose.disconnect(); await mongoServer.stop(); });
  afterEach(async () => { await Invoice.deleteMany({}); await Payment.deleteMany({}); jest.clearAllMocks(); });

  test('requestPaybillFallback issues an expiring C2B intent', async () => {
    const invoice = await makeInvoice();
    const { res, payment, accountRef } = await issueFallback(invoice);

    expect(res.statusCode).toBe(201);
    expect(res.body.paybill).toBeDefined();
    expect(accountRef).toMatch(/^NS/);
    expect(payment.channel).toBe('C2B_PAYBILL');
    expect(payment.status).toBe('pending');
    expect(payment.amount).toBe(50000); // from invoice, not client
    expect(payment.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(require('../../services/sms.service').sendSMS).toHaveBeenCalled();
  });

  test('c2bValidation accepts a valid ref and rejects unknown/expired', async () => {
    const invoice = await makeInvoice();
    const { accountRef, payment } = await issueFallback(invoice);

    const okRes = mockRes();
    await controller.c2bValidation({ body: { BillRefNumber: accountRef, TransAmount: 50000 } }, okRes);
    expect(okRes.body.ResultCode).toBe(0);

    const badRes = mockRes();
    await controller.c2bValidation({ body: { BillRefNumber: 'NSUNKNOWN', TransAmount: 50000 } }, badRes);
    expect(badRes.body.ResultCode).toBe('C2B00012');

    // Expire it, then validation should reject.
    payment.expiresAt = new Date(Date.now() - 1000); await payment.save();
    const expRes = mockRes();
    await controller.c2bValidation({ body: { BillRefNumber: accountRef, TransAmount: 50000 } }, expRes);
    expect(expRes.body.ResultCode).toBe('C2B00012');
  });

  test('c2bConfirmation on a valid ref settles payment + invoice', async () => {
    const invoice = await makeInvoice();
    const { accountRef, payment } = await issueFallback(invoice);

    const res = mockRes();
    await controller.c2bConfirmation(confirmation(accountRef), res);
    expect(res.body.ResultCode).toBe(0);

    const settled = await Payment.findById(payment._id);
    expect(settled.status).toBe('completed');
    expect(settled.mpesaReceipt).toBe('QC2B123456');
    expect((await Invoice.findById(invoice._id)).status).toBe('paid');
    expect(mpesaService.reverseTransaction).not.toHaveBeenCalled();
  });

  test('c2bConfirmation after expiry auto-reverses the payment', async () => {
    const invoice = await makeInvoice();
    const { accountRef, payment } = await issueFallback(invoice);
    payment.expiresAt = new Date(Date.now() - 1000); await payment.save();

    const res = mockRes();
    await controller.c2bConfirmation(confirmation(accountRef), res);
    expect(res.body.ResultCode).toBe(0);

    expect(mpesaService.reverseTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'QC2B123456' })
    );
    const reloaded = await Payment.findById(payment._id);
    expect(reloaded.status).not.toBe('completed');
    expect(reloaded.reversal.requested).toBe(true);
    expect((await Invoice.findById(invoice._id)).status).toBe('issued');
  });

  test('c2bConfirmation for an unknown ref still reverses the funds', async () => {
    const res = mockRes();
    await controller.c2bConfirmation(confirmation('NSGHOST9', { receipt: 'QGHOST0001' }), res);
    expect(mpesaService.reverseTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'QGHOST0001' })
    );
  });

  test('expiry job clears accountRef and marks expired', async () => {
    const invoice = await makeInvoice();
    const { payment } = await issueFallback(invoice);
    payment.expiresAt = new Date(Date.now() - 1000); await payment.save();

    const { expired } = await expireStaleIntents();
    expect(expired).toBe(1);
    const reloaded = await Payment.findById(payment._id);
    expect(reloaded.status).toBe('expired');
    expect(reloaded.accountRef).toBeUndefined();
  });
});
