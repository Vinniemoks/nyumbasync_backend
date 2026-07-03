const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Capture outbound email instead of hitting SendGrid.
jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn(async () => true)
}));

const emailService = require('../../services/emailService');
const User = require('../../models/user.model');
const Payment = require('../../models/payment.model');
const Withdrawal = require('../../models/withdrawal.model');
const controller = require('../../controllers/withdrawal.controller');

let mongoServer;
let landlord;
let tenant;

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((b) => { res.body = b; return res; });
  return res;
};

// Pull the emailed OTP out of the mocked sendEmail call.
const lastEmailedCode = () => {
  const { text } = emailService.sendEmail.mock.calls.at(-1)[0];
  return text.match(/(\d{6})/)[1];
};

const makeCompletedPayment = (amount) => Payment.create({
  tenant: tenant._id,
  landlord: landlord._id,
  property: new mongoose.Types.ObjectId(),
  amount,
  phoneUsed: '254712345678',
  status: 'completed',
  accountingCode: 'RENT',
  // Completed payments require real-looking M-Pesa settlement fields.
  mpesaReceipt: `Q${crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 9)}`,
  mpesaTransactionDate: new Date()
});

describe('Withdrawals (earnings + MFA step-up)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    landlord = await User.create({
      phone: '254733000111', firstName: 'Larry', lastName: 'Landlord',
      email: 'larry@example.com', role: 'landlord', password: 'password123'
    });
    tenant = await User.create({
      phone: '254712345678', firstName: 'Tess', lastName: 'Tenant',
      email: 'tess@example.com', role: 'tenant', password: 'password123'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Payment.deleteMany({});
    await Withdrawal.deleteMany({});
    await User.updateOne({ _id: landlord._id }, { $unset: { actionOtp: 1, actionOtpExpiry: 1, actionOtpPurpose: 1 } });
    jest.clearAllMocks();
  });

  test('balance = completed payments minus withdrawals', async () => {
    await makeCompletedPayment(50000);
    await makeCompletedPayment(30000);
    await Withdrawal.create({ user: landlord._id, amount: 20000, method: 'mpesa', destination: { phone: '254733000111' }, mfaMethod: 'email_otp' });

    const res = mockRes();
    await controller.getBalance({ user: { id: landlord._id } }, res);
    expect(res.body.collected).toBe(80000);
    expect(res.body.withdrawn).toBe(20000);
    expect(res.body.available).toBe(60000);
  });

  test('withdrawal without any second factor is rejected', async () => {
    await makeCompletedPayment(50000);
    const res = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 10000, method: 'mpesa', destination: { phone: '0733000111' } }
    }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.mfaRequired).toBe(true);
    expect(await Withdrawal.countDocuments()).toBe(0);
  });

  test('email OTP flow: request code → withdraw with it (single use)', async () => {
    await makeCompletedPayment(50000);

    // 1. Request the code.
    const otpRes = mockRes();
    await controller.requestOtp({ user: { id: landlord._id } }, otpRes);
    expect(otpRes.body.success).toBe(true);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const code = lastEmailedCode();

    // 2. Withdraw with it.
    const res = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 10000, method: 'mpesa', destination: { phone: '0733000111' }, otp: code }
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.withdrawal.status).toBe('queued');
    expect(res.body.withdrawal.reference).toMatch(/^WD/);

    const saved = await Withdrawal.findById(res.body.withdrawal.id);
    expect(saved.mfaMethod).toBe('email_otp');
    expect(saved.destination.phone).toBe('254733000111'); // normalized

    // 3. The code is single-use.
    const reuse = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 5000, method: 'mpesa', destination: { phone: '0733000111' }, otp: code }
    }, reuse);
    expect(reuse.statusCode).toBe(401);
  });

  test('cannot withdraw more than the available balance', async () => {
    await makeCompletedPayment(30000);
    await controller.requestOtp({ user: { id: landlord._id } }, mockRes());
    const code = lastEmailedCode();

    const res = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 40000, method: 'mpesa', destination: { phone: '0733000111' }, otp: code }
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/available balance/i);
  });

  test('bank withdrawals require full destination details', async () => {
    await makeCompletedPayment(30000);
    await controller.requestOtp({ user: { id: landlord._id } }, mockRes());
    const code = lastEmailedCode();

    const bad = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 10000, method: 'bank', destination: { bankName: 'Equity' }, otp: code }
    }, bad);
    expect(bad.statusCode).toBe(400);

    const good = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: {
        amount: 10000, method: 'bank', otp: code,
        destination: { bankName: 'Equity', accountName: 'Larry Landlord', accountNumber: '0123456789' }
      }
    }, good);
    expect(good.statusCode).toBe(201);
  });

  test('TOTP verifies as a second factor when MFA is enabled', async () => {
    await makeCompletedPayment(30000);
    const speakeasy = require('speakeasy');
    const secret = speakeasy.generateSecret({ length: 20 });
    await User.updateOne({ _id: landlord._id }, { mfaEnabled: true, mfaSecret: secret.base32 });
    const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });

    const res = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 10000, method: 'mpesa', destination: { phone: '0733000111' }, totpToken: token }
    }, res);
    expect(res.statusCode).toBe(201);
    expect((await Withdrawal.findById(res.body.withdrawal.id)).mfaMethod).toBe('totp');

    await User.updateOne({ _id: landlord._id }, { mfaEnabled: false, $unset: { mfaSecret: 1 } });
  });

  test('expired email OTP is rejected', async () => {
    await makeCompletedPayment(30000);
    await controller.requestOtp({ user: { id: landlord._id } }, mockRes());
    const code = lastEmailedCode();
    await User.updateOne({ _id: landlord._id }, { actionOtpExpiry: new Date(Date.now() - 1000) });

    const res = mockRes();
    await controller.createWithdrawal({
      user: { id: landlord._id },
      body: { amount: 10000, method: 'mpesa', destination: { phone: '0733000111' }, otp: code }
    }, res);
    expect(res.statusCode).toBe(401);
  });

  test('OTP endpoint reports when email delivery is unconfigured', async () => {
    emailService.sendEmail.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.requestOtp({ user: { id: landlord._id } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });
});
