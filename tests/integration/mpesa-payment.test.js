const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock the Daraja HTTP layer — we can't reach Safaricom in tests, so we assert
// the wiring around it (pending payment, callback handling, invoice settlement).
jest.mock('../../services/mpesa.service', () => ({
  isConfigured: jest.fn(() => true),
  initiateSTKPush: jest.fn(async () => ({
    MerchantRequestID: 'mer-1',
    CheckoutRequestID: 'ws_CO_TEST123',
    ResponseCode: '0'
  }))
}));
jest.mock('../../services/emailService', () => ({
  sendPaymentConfirmation: jest.fn(async () => true)
}));

const mpesaService = require('../../services/mpesa.service');
const User = require('../../models/user.model');
const Lease = require('../../models/lease.model');
const Invoice = require('../../models/invoice.model');
const Payment = require('../../models/payment.model');
const controller = require('../../controllers/payment.controller');

let mongoServer;
let tenant;
let landlord;

// Minimal mock res that records status + json/end payloads.
const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((b) => { res.body = b; return res; });
  res.end = jest.fn(() => res);
  return res;
};

const successCallback = (checkoutId, { receipt = 'QGH7XYZ123', phone = 254712345678 } = {}) => ({
  Body: {
    stkCallback: {
      CheckoutRequestID: checkoutId,
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: 50000 },
          { Name: 'MpesaReceiptNumber', Value: receipt },
          { Name: 'TransactionDate', Value: 20260620140500 },
          { Name: 'PhoneNumber', Value: phone }
        ]
      }
    }
  }
});

const makeInvoice = async () => {
  return Invoice.create({
    tenant: tenant._id,
    landlord: landlord._id,
    property: new mongoose.Types.ObjectId(),
    lease: new mongoose.Types.ObjectId(),
    lineItems: [{ description: 'Rent for June 2026', accountingCode: 'RENT', amount: 50000 }],
    periodCovered: { from: new Date(2026, 5, 1), to: new Date(2026, 5, 30) },
    dueDate: new Date(2026, 5, 5),
    status: 'issued'
  });
};

describe('Live M-Pesa payment flow', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    tenant = await User.create({
      phone: '254712345678', firstName: 'Tess', lastName: 'Tenant',
      email: 'tess@example.com', role: 'tenant', password: 'password123'
    });
    landlord = await User.create({
      phone: '254733000111', firstName: 'Larry', lastName: 'Landlord',
      email: 'larry@example.com', role: 'landlord', password: 'password123'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Invoice.deleteMany({});
    await Payment.deleteMany({});
    await Lease.deleteMany({});
    jest.clearAllMocks();
  });

  test('initiate → callback → settles the bound invoice', async () => {
    const invoice = await makeInvoice();

    // 1. Initiate STK push for that invoice.
    const initReq = { body: { phoneNumber: '0712345678', invoiceId: invoice._id }, user: { id: tenant._id } };
    const initRes = mockRes();
    await controller.initiateStkPush(initReq, initRes);

    expect(initRes.statusCode).toBe(202);
    expect(initRes.body.success).toBe(true);
    expect(mpesaService.initiateSTKPush).toHaveBeenCalledTimes(1);
    // Amount is taken from the invoice, not the client.
    const [, stkAmount, stkRef] = mpesaService.initiateSTKPush.mock.calls[0];
    expect(stkAmount).toBe(50000);
    expect(stkRef.length).toBeLessThanOrEqual(12);

    const payment = await Payment.findById(initRes.body.transactionId);
    expect(payment.status).toBe('pending');
    expect(String(payment.invoice)).toBe(String(invoice._id));
    expect(payment.mpesaRequestId).toBe('ws_CO_TEST123');
    expect(payment.phoneUsed).toBe('254712345678');

    // 2. Safaricom confirms via callback.
    const cbRes = mockRes();
    await controller.mpesaCallback({ body: successCallback('ws_CO_TEST123') }, cbRes);
    expect(cbRes.statusCode).toBe(200);

    const settled = await Payment.findById(payment._id);
    expect(settled.status).toBe('completed');
    expect(settled.mpesaReceipt).toBe('QGH7XYZ123');
    expect(settled.mpesaTransactionDate).toBeTruthy();

    // 3. The bound invoice is now paid.
    const paidInvoice = await Invoice.findById(invoice._id);
    expect(paidInvoice.status).toBe('paid');
    expect(String(paidInvoice.payment)).toBe(String(payment._id));

    // 4. Status endpoint reports success.
    const statusReq = { params: { id: payment._id }, user: { id: tenant._id } };
    const statusRes = mockRes();
    await controller.checkPaymentStatus(statusReq, statusRes);
    expect(statusRes.body.status).toBe('success');
    expect(statusRes.body.mpesaReceipt).toBe('QGH7XYZ123');
  });

  test('failed callback marks payment failed and leaves invoice open', async () => {
    const invoice = await makeInvoice();
    const initRes = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id }, user: { id: tenant._id } },
      initRes
    );
    const paymentId = initRes.body.transactionId;

    const cbRes = mockRes();
    await controller.mpesaCallback({
      body: { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_TEST123', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } }
    }, cbRes);

    const payment = await Payment.findById(paymentId);
    expect(payment.status).toBe('failed');
    expect(payment.failureReason).toMatch(/cancelled/i);
    expect((await Invoice.findById(invoice._id)).status).toBe('issued');
  });

  test('duplicate success callback does not double-process', async () => {
    const invoice = await makeInvoice();
    const initRes = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id }, user: { id: tenant._id } },
      initRes
    );
    await controller.mpesaCallback({ body: successCallback('ws_CO_TEST123') }, mockRes());
    const firstReceipt = (await Payment.findById(initRes.body.transactionId)).mpesaReceipt;

    // Second callback with a different receipt must be ignored (already settled).
    await controller.mpesaCallback({ body: successCallback('ws_CO_TEST123', { receipt: 'ZZZ9999999' }) }, mockRes());
    expect((await Payment.findById(initRes.body.transactionId)).mpesaReceipt).toBe(firstReceipt);
  });

  test('ad-hoc payment resolves property/landlord from the active lease', async () => {
    await Lease.create({
      property: new mongoose.Types.ObjectId(),
      tenant: tenant._id,
      landlord: landlord._id,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 1),
      status: 'active',
      terms: { durationMonths: 12, rentAmount: 30000, depositAmount: 30000, rentDueDate: 5 }
    });

    const res = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', amount: 30000 }, user: { id: tenant._id } },
      res
    );
    expect(res.statusCode).toBe(202);
    const payment = await Payment.findById(res.body.transactionId);
    expect(payment.amount).toBe(30000);
    expect(String(payment.landlord)).toBe(String(landlord._id));
  });

  test('returns 503 when M-Pesa is not configured', async () => {
    mpesaService.isConfigured.mockReturnValueOnce(false);
    const invoice = await makeInvoice();
    const res = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id }, user: { id: tenant._id } },
      res
    );
    expect(res.statusCode).toBe(503);
    // No STK attempt, no lingering pending payment beyond what we can settle.
    expect(mpesaService.initiateSTKPush).not.toHaveBeenCalled();
  });

  // A success callback whose metadata Amount matches a partial payment.
  const successCallbackFor = (checkoutId, amount) => ({
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amount },
            // Receipts must look real: 10 alphanumeric chars.
            { Name: 'MpesaReceiptNumber', Value: `QGH${amount}XXXXXXX`.slice(0, 10) },
            { Name: 'TransactionDate', Value: 20260620140500 },
            { Name: 'PhoneNumber', Value: 254712345678 }
          ]
        }
      }
    }
  });

  test('partial payment settles part of the invoice; next payment defaults to the remaining balance', async () => {
    const invoice = await makeInvoice(); // total 50,000

    // Pay 20,000 of it.
    mpesaService.initiateSTKPush.mockResolvedValueOnce({ CheckoutRequestID: 'ws_CO_PART1', ResponseCode: '0' });
    const res1 = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id, amount: 20000 }, user: { id: tenant._id } },
      res1
    );
    expect(res1.statusCode).toBe(202);
    expect(mpesaService.initiateSTKPush.mock.calls[0][1]).toBe(20000);

    await controller.mpesaCallback({ body: successCallbackFor('ws_CO_PART1', 20000) }, mockRes());

    const partiallyPaid = await Invoice.findById(invoice._id);
    expect(partiallyPaid.status).toBe('partially_paid');
    expect(partiallyPaid.amountPaid).toBe(20000);
    expect(partiallyPaid.balance).toBe(30000);

    // Paying again with no amount defaults to the remaining 30,000 (not the total).
    mpesaService.initiateSTKPush.mockResolvedValueOnce({ CheckoutRequestID: 'ws_CO_PART2', ResponseCode: '0' });
    const res2 = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id }, user: { id: tenant._id } },
      res2
    );
    expect(res2.statusCode).toBe(202);
    expect(mpesaService.initiateSTKPush.mock.calls[1][1]).toBe(30000);

    await controller.mpesaCallback({ body: successCallbackFor('ws_CO_PART2', 30000) }, mockRes());
    const paid = await Invoice.findById(invoice._id);
    expect(paid.status).toBe('paid');
    expect(paid.amountPaid).toBe(50000);
  });

  test('rejects a payment above the outstanding balance', async () => {
    const invoice = await makeInvoice();
    const res = mockRes();
    await controller.initiateStkPush(
      { body: { phoneNumber: '0712345678', invoiceId: invoice._id, amount: 60000 }, user: { id: tenant._id } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/exceeds the outstanding balance/i);
    expect(mpesaService.initiateSTKPush).not.toHaveBeenCalled();
  });

  test('landlord prompts the tenant phone for a partial amount', async () => {
    const invoice = await makeInvoice();

    const res = mockRes();
    await controller.promptTenantStkPush(
      { body: { invoiceId: invoice._id, amount: 15000 }, user: { id: landlord._id } },
      res
    );
    expect(res.statusCode).toBe(202);

    // STK went to the TENANT's phone for the requested partial amount.
    const [stkPhone, stkAmount] = mpesaService.initiateSTKPush.mock.calls[0];
    expect(stkPhone).toBe('254712345678');
    expect(stkAmount).toBe(15000);

    const payment = await Payment.findById(res.body.transactionId);
    expect(String(payment.tenant)).toBe(String(tenant._id));
    expect(String(payment.initiatedBy)).toBe(String(landlord._id));
    expect(payment.amount).toBe(15000);
  });

  test("landlord cannot prompt another landlord's invoice", async () => {
    const invoice = await makeInvoice();
    const otherLandlord = await User.create({
      phone: '254733999888', firstName: 'Olly', lastName: 'Other',
      email: 'olly@example.com', role: 'landlord', password: 'password123'
    });

    const res = mockRes();
    await controller.promptTenantStkPush(
      { body: { invoiceId: invoice._id }, user: { id: otherLandlord._id } },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(mpesaService.initiateSTKPush).not.toHaveBeenCalled();
  });

  test('prompt requires an invoiceId', async () => {
    const res = mockRes();
    await controller.promptTenantStkPush({ body: {}, user: { id: landlord._id } }, res);
    expect(res.statusCode).toBe(400);
  });
});
