const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Capture outbound email instead of hitting SendGrid.
jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn(async () => true),
  sendPaymentConfirmation: jest.fn(async () => true)
}));

const emailService = require('../../services/emailService');
const User = require('../../models/user.model');
const verificationService = require('../../services/verification.service');
const authController = require('../../controllers/auth.controller');
const mfaController = require('../../controllers/mfa.controller');

let mongoServer;

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((b) => { res.body = b; return res; });
  return res;
};

const lastEmail = () => emailService.sendEmail.mock.calls.at(-1)[0];
// Anchor near the word "code" — supports 6-digit email-verification codes and
// 8-digit login OTPs. A bare \d+ can match inside the hex link token, so we
// bound the length.
const lastEmailedCode = () => lastEmail().text.match(/code[^\d]{0,20}(\d{6,8})/i)[1];
const lastEmailedLinkToken = () => lastEmail().text.match(/token=([a-f0-9]+)/)[1];

describe('Email verification + email-OTP MFA', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  const makeUser = (over = {}) => User.create({
    phone: '254712000001', firstName: 'Vera', lastName: 'Verify',
    email: 'vera@example.com', role: 'tenant', password: 'password123',
    ...over
  });

  test('signup sends a confirmation email with link + code', async () => {
    const res = mockRes();
    await authController.signup({
      body: {
        firstName: 'New', lastName: 'User', email: 'newbie@example.com',
        password: 'password123', phoneNumber: '254712000009', roles: ['tenant']
      }
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.emailVerificationSent).toBe(true);
    expect(res.body.user.emailVerified).toBe(false);

    const mail = lastEmail();
    expect(mail.to).toBe('newbie@example.com');
    expect(mail.text).toMatch(/verify-email\?token=/);
    expect(mail.text).toMatch(/\d{6}/);
  });

  test('verify by link token marks the account verified', async () => {
    const user = await makeUser();
    await verificationService.sendEmailVerification(user);
    const token = lastEmailedLinkToken();

    const res = mockRes();
    await authController.verifyEmail({ query: { token }, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect((await User.findById(user._id)).emailVerified).toBe(true);
  });

  test('verify by email + code works, and codes are single-use', async () => {
    const user = await makeUser();
    await verificationService.sendEmailVerification(user);
    const code = lastEmailedCode();

    const res = mockRes();
    await authController.verifyEmail({ query: {}, body: { email: user.email, code } }, res);
    expect(res.statusCode).toBe(200);

    const again = mockRes();
    await authController.verifyEmail({ query: {}, body: { email: user.email, code } }, again);
    expect(again.statusCode).toBe(400);
  });

  test('garbage tokens are rejected', async () => {
    const res = mockRes();
    await authController.verifyEmail({ query: { token: 'deadbeef' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  test('login with email MFA enabled: OTP round-trip completes login', async () => {
    await makeUser({ mfaEmailEnabled: true });

    // 1. Password login → held at the email-OTP step.
    const loginRes = mockRes();
    await authController.login({
      body: { identifier: 'vera@example.com', password: 'password123' }
    }, loginRes);

    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.mfaMethod).toBe('email');
    expect(loginRes.body.emailOtpSent).toBe(true);
    expect(loginRes.body.token).toBeUndefined(); // no session yet
    const { mfaSessionToken } = loginRes.body;
    const code = lastEmailedCode();

    // 2. Complete with the emailed code.
    const verifyRes = mockRes();
    await mfaController.verifyMFALogin({
      body: { mfaSessionToken, emailOtp: code }
    }, verifyRes);

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.data.accessToken).toBeTruthy();
    expect(verifyRes.body.data.user.email).toBe('vera@example.com');
  });

  test('login OTP is rejected when wrong, and cannot be reused after success', async () => {
    await makeUser({ mfaEmailEnabled: true });
    const loginRes = mockRes();
    await authController.login({ body: { identifier: 'vera@example.com', password: 'password123' } }, loginRes);
    const { mfaSessionToken } = loginRes.body;
    const code = lastEmailedCode();

    const wrong = mockRes();
    await mfaController.verifyMFALogin({ body: { mfaSessionToken, emailOtp: '00000000' } }, wrong);
    expect(wrong.statusCode).toBe(401);

    const ok = mockRes();
    await mfaController.verifyMFALogin({ body: { mfaSessionToken, emailOtp: code } }, ok);
    expect(ok.statusCode).toBe(200);

    // Replay with the consumed code fails.
    const replay = mockRes();
    await mfaController.verifyMFALogin({ body: { mfaSessionToken, emailOtp: code } }, replay);
    expect(replay.statusCode).toBe(401);
  });

  test('setEmailMfa: enabling is one call, disabling needs the password', async () => {
    const user = await makeUser();

    const on = mockRes();
    await mfaController.setEmailMfa({ user: { id: user._id }, body: { enabled: true } }, on);
    expect(on.statusCode).toBe(200);
    expect((await User.findById(user._id)).mfaEmailEnabled).toBe(true);

    const offNoPw = mockRes();
    await mfaController.setEmailMfa({ user: { id: user._id }, body: { enabled: false } }, offNoPw);
    expect(offNoPw.statusCode).toBe(401);

    const off = mockRes();
    await mfaController.setEmailMfa({ user: { id: user._id }, body: { enabled: false, password: 'password123' } }, off);
    expect(off.statusCode).toBe(200);
    expect((await User.findById(user._id)).mfaEmailEnabled).toBe(false);
  });

  test('signup still succeeds when email delivery is down', async () => {
    emailService.sendEmail.mockResolvedValueOnce(false);
    const res = mockRes();
    await authController.signup({
      body: {
        firstName: 'No', lastName: 'Mail', email: 'nomail@example.com',
        password: 'password123', phoneNumber: '254712000010', roles: ['tenant']
      }
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.emailVerificationSent).toBe(false);
  });
});
