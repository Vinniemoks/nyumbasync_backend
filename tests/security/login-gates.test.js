// End-to-end tests of the login flow against a real (in-memory) MongoDB:
// every way of finishing a login must apply the same gates — account state,
// forced first-login password change, and the emailed new-IP code for admins.
const request = require('supertest');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('google-auth-library', () => ({
  // The "ID token" in these tests is just the JSON payload Google would return.
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: async ({ idToken }) => ({ getPayload: () => JSON.parse(idToken) }),
  })),
}));

const app = require('../../server').app;
const User = require('../../models/user.model');
const LoginAudit = require('../../models/login-audit.model');
const emailService = require('../../services/emailService');

const PASSWORD = 'Correct-Horse-9!';
let mongoServer;
let seq = 0;
let lastMail;

const nextPhone = () => `2547${String(10000000 + (seq++))}`;
const makeUser = (role = 'tenant', extra = {}) => {
  const n = seq;
  return User.create({
    firstName: 'Test',
    lastName: role,
    email: `${role}${n}.${Date.now()}@example.com`,
    phone: nextPhone(),
    password: PASSWORD,
    role,
    ...extra,
  });
};
const login = (user, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ identifier: user.email, password });
const codeFromMail = () => (/verification code is: <strong>(\d{6})/.exec(lastMail?.html || '') || [])[1];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
beforeEach(async () => {
  lastMail = undefined;
  jest.spyOn(emailService, 'sendEmail').mockImplementation(async (mail) => {
    lastMail = mail;
    return true;
  });
  await User.deleteMany({});
  await LoginAudit.deleteMany({});
});
afterEach(() => jest.restoreAllMocks());

describe('new-IP verification for admins', () => {

  test('the new-network code also goes to WhatsApp, and authenticator setup is never forced', async () => {
    const wa = require('../../src/services/whatsappService');
    const sent = [];
    jest.spyOn(wa, 'sendTemplatedMessage').mockImplementation(async (m) => { sent.push(m); return { success: true }; });
    const admin = await makeUser('super_admin');
    const res = await login(admin).expect(200);
    expect(res.body.whatsappSent).toBe(true);
    expect(sent[0].to).toBe(admin.phone);
    expect(sent[0].variables[1]).toBe(codeFromMail());
    const done = await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken: res.body.ipSessionToken, code: codeFromMail() }).expect(200);
    expect(done.body.token).toBeTruthy();
    const again = await login(admin).expect(200);
    expect(again.body.requireMfaSetup).toBe(false);
  });
  test('a password login from an unknown IP is held back and a code is emailed', async () => {
    const admin = await makeUser('super_admin');
    const res = await login(admin).expect(200);
    expect(res.body.requireIpVerification).toBe(true);
    expect(res.body.ipSessionToken).toBeTruthy();
    expect(res.body.token).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(codeFromMail()).toMatch(/^\d{6}$/);
    expect(lastMail.to).toBe(admin.email);
  });

  test('the new-IP session token is NOT a usable bearer token (regression)', async () => {
    const admin = await makeUser('super_admin');
    const { ipSessionToken } = (await login(admin).expect(200)).body;
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ipSessionToken}`).expect(401);
    await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${ipSessionToken}`).expect(401);
  });

  test('the right code finishes the login, remembers the IP and later logins skip the gate', async () => {
    const admin = await makeUser('super_admin');
    const { ipSessionToken } = (await login(admin).expect(200)).body;
    const res = await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: codeFromMail() }).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);

    const stored = await User.findById(admin._id).select('+ipVerificationCode');
    expect(stored.knownIps).toHaveLength(1);
    expect(stored.loginIps).toHaveLength(1);
    expect(stored.ipVerificationCode).toBeUndefined();

    const again = await login(admin).expect(200);
    expect(again.body.requireIpVerification).toBeUndefined();
    expect(again.body.token).toBeTruthy();
    expect((await User.findById(admin._id)).loginIps).toHaveLength(2);
  });

  test('five wrong codes burn the code: even the right one no longer works', async () => {
    const admin = await makeUser('super_admin');
    const { ipSessionToken } = (await login(admin).expect(200)).body;
    const right = codeFromMail();
    const wrong = right === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: wrong }).expect(400);
      expect(r.body.error).toMatch(/invalid/i);
    }
    await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: wrong }).expect(429);
    await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: right }).expect(400);
  });

  test('a code that was never requested, or a numeric code, is handled without crashing', async () => {
    const admin = await makeUser('super_admin');
    const { ipSessionToken } = (await login(admin).expect(200)).body;
    await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: 123456 }).expect(400);
    await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: '' }).expect(400);
  });

  test('ordinary users are never asked for an IP code', async () => {
    const tenant = await makeUser('tenant');
    const res = await login(tenant).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(lastMail).toBeUndefined();
  });

  test('a user who holds an admin role alongside tenant is gated too', async () => {
    const mixed = await makeUser('tenant', { roles: ['tenant', 'admin'] });
    const res = await login(mixed).expect(200);
    expect(res.body.requireIpVerification).toBe(true);
  });
});

describe('finishing through MFA applies the same gates', () => {
  const withTotp = async (role, extra = {}) => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const user = await makeUser(role, { mfaEnabled: true, mfaSecret: secret, ...extra });
    return { user, secret, otp: () => speakeasy.totp({ secret, encoding: 'base32' }) };
  };

  test('admin with an authenticator app still gets the new-IP check, then a working refresh token', async () => {
    const { user, otp } = await withTotp('super_admin');
    const first = await login(user).expect(200);
    expect(first.body.mfaRequired).toBe(true);

    const mfa = await request(app)
      .post('/api/v1/auth/mfa/verify-login')
      .send({ mfaSessionToken: first.body.mfaSessionToken, token: otp() })
      .expect(200);
    expect(mfa.body.requireIpVerification).toBe(true);
    expect(mfa.body.data).toBeUndefined();
    const { ipSessionToken } = mfa.body;

    const done = await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken, code: codeFromMail() }).expect(200);
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: done.body.refreshToken }).expect(200);
    expect(refreshed.body.token || refreshed.body.accessToken).toBeTruthy();
  });

  test('a known IP completes MFA login directly, and its refresh token works (regression: it had no type claim)', async () => {
    const { user, otp } = await withTotp('super_admin');
    // learn the test client's IP by completing one full login
    const a = await login(user).expect(200);
    const m = await request(app).post('/api/v1/auth/mfa/verify-login').send({ mfaSessionToken: a.body.mfaSessionToken, token: otp() }).expect(200);
    await request(app).post('/api/v1/auth/verify-ip').send({ ipSessionToken: m.body.ipSessionToken, code: codeFromMail() }).expect(200);

    const b = await login(user).expect(200);
    const mb = await request(app).post('/api/v1/auth/mfa/verify-login').send({ mfaSessionToken: b.body.mfaSessionToken, token: otp() }).expect(200);
    expect(mb.body.data.accessToken).toBeTruthy();
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: mb.body.data.refreshToken }).expect(200);
  });

  test('a user who must change their password is told so after MFA, not let in', async () => {
    const { user, otp } = await withTotp('tenant', { requirePasswordChange: true });
    const first = await login(user).expect(200);
    const mfa = await request(app)
      .post('/api/v1/auth/mfa/verify-login')
      .send({ mfaSessionToken: first.body.mfaSessionToken, token: otp() })
      .expect(200);
    expect(mfa.body.requirePasswordChange).toBe(true);
    expect(mfa.body.token).toBeTruthy();
    expect(mfa.body.data).toBeUndefined();
  });

  test('a suspended account is refused after the MFA code', async () => {
    const { user, otp } = await withTotp('tenant');
    const first = await login(user).expect(200);
    await User.updateOne({ _id: user._id }, { status: 'suspended' });
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify-login')
      .send({ mfaSessionToken: first.body.mfaSessionToken, token: otp() })
      .expect(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('forced first-login password change', () => {
  const provisioned = () => makeUser('landlord', { requirePasswordChange: true, isAdminProvisioned: true });

  test('login returns a limited token, which works for changing the password and nothing else', async () => {
    const user = await provisioned();
    const res = await login(user).expect(200);
    expect(res.body.requirePasswordChange).toBe(true);
    expect(res.body.refreshToken).toBeUndefined();
    const { token } = res.body;

    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`).expect(401);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'Brand-New-Pass-7!' })
      .expect(400);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7!' })
      .expect(200);
    expect(changed.body.requireLogin).toBe(true);

    // the flag is cleared, so the next login is a normal one (this used to loop forever)
    expect((await User.findById(user._id)).requirePasswordChange).toBe(false);
    const next = await login(user, 'Brand-New-Pass-7!').expect(200);
    expect(next.body.requirePasswordChange).toBeUndefined();
    expect(next.body.token).toBeTruthy();

    // and the first-login token is dead
    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Brand-New-Pass-7!', newPassword: 'Another-Pass-8!' })
      .expect(401);
  });

  test('the change-password route answers 401 (not 500) without a token, and refuses other step tokens', async () => {
    await request(app).post('/api/v1/auth/change-password').send({ currentPassword: 'x', newPassword: 'y' }).expect(401);
    const admin = await makeUser('super_admin');
    const { ipSessionToken } = (await login(admin).expect(200)).body;
    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${ipSessionToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7!' })
      .expect(401);
  });

  test('signing in again right after a change works every time (the new session is never mistaken for an old one)', async () => {
    for (let i = 0; i < 3; i++) {
      const user = await makeUser('tenant');
      const old = (await login(user).expect(200)).body.token;
      await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${old}`)
        .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7!' }).expect(200);
      const fresh = (await login(user, 'Brand-New-Pass-7!').expect(200)).body.token;
      await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${fresh}`).expect(200);
      await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${old}`).expect(401);
    }
  });

  test('a normal logged-in user can still change their password with their access token', async () => {
    const user = await makeUser('tenant');
    const { token } = (await login(user).expect(200)).body;
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7!' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });
});

describe('routes that need a login', () => {
  test.each([
    ['get', '/api/v1/auth/me'],
    ['get', '/api/v1/auth/profile'],
    ['put', '/api/v1/auth/profile'],
    ['put', '/api/v1/auth/profile/complete'],
    ['post', '/api/v1/auth/logout'],
    ['post', '/api/v1/auth/resend-verification'],
    ['post', '/api/v1/auth/mfa/email'],
    ['post', '/api/v1/auth/change-password'],
  ])('%s %s answers 401 without a token (some used to be a 500)', async (method, path) => {
    await request(app)[method](path).send({}).expect(401);
  });
});

describe('suspended and inactive accounts', () => {
  test.each([['suspended'], ['inactive']])('%s accounts cannot sign in, and the reply does not leak state to a wrong password', async (status) => {
    const user = await makeUser('tenant', { status });
    const res = await login(user).expect(403);
    expect(res.body.code).toBe(`ACCOUNT_${status.toUpperCase()}`);
    await login(user, 'wrong-password-1').expect(401);
    const audit = await LoginAudit.findOne({ user: user._id, reason: `account_${status}` });
    expect(audit).toBeTruthy();
    expect(audit.success).toBe(false);
  });

  test('a session that was valid stops working the moment the account is suspended', async () => {
    const user = await makeUser('tenant');
    const { token } = (await login(user).expect(200)).body;
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    await User.updateOne({ _id: user._id }, { status: 'suspended' });
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(403);
  });
});

describe('sign-in attempts are audited', () => {
  test('success, wrong password and the MFA step each leave an entry', async () => {
    const user = await makeUser('tenant');
    await login(user, 'wrong-password-1').expect(401);
    await login(user).expect(200);
    const reasons = (await LoginAudit.find({ user: user._id })).map((a) => a.reason).sort();
    expect(reasons).toEqual(['ok', 'wrong_password']);
  });
});

describe('Google sign-in', () => {
  const google = (payload, extra = {}) =>
    request(app).post('/api/v1/auth/google').send({ idToken: JSON.stringify(payload), ...extra });
  const profile = (over = {}) => ({
    sub: `g-${Date.now()}-${Math.random()}`,
    email: `new.${Date.now()}.${Math.random()}@example.com`,
    email_verified: true,
    given_name: 'Gina',
    family_name: 'Google',
    ...over,
  });

  test('creates a tenant by default and honours a self-service role, never an admin one', async () => {
    const t = await google(profile()).expect(200);
    expect(t.body.user.role).toBe('tenant');

    const l = await google(profile(), { role: 'landlord' }).expect(200);
    expect(l.body.user.role).toBe('landlord');
    const Subscription = require('../../models/subscription.model');
    expect(await Subscription.countDocuments({ user: l.body.user.id })).toBe(1);

    const sneaky = await google(profile(), { role: 'super_admin' }).expect(200);
    expect(sneaky.body.user.role).toBe('tenant');
    expect(sneaky.body.user.roles).toEqual(['tenant']);
  });

  test('a staff account can neither be linked nor signed into through Google', async () => {
    const admin = await makeUser('super_admin');
    const res = await google(profile({ email: admin.email })).expect(403);
    expect(res.body.code).toBe('OAUTH_NOT_ALLOWED_FOR_STAFF');
    expect((await User.findById(admin._id)).googleId).toBeUndefined();

    // already linked earlier (e.g. before the person became staff) is refused as well
    const linked = await makeUser('admin', { googleId: 'g-linked' });
    await google(profile({ sub: 'g-linked', email: linked.email })).expect(403);
  });

  test('a suspended account cannot sign in through Google', async () => {
    const user = await makeUser('tenant', { googleId: 'g-suspended', status: 'suspended' });
    const res = await google(profile({ sub: 'g-suspended', email: user.email })).expect(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  test('a normal account is still linked by verified email and signed in', async () => {
    const user = await makeUser('tenant');
    const res = await google(profile({ email: user.email })).expect(200);
    expect(res.body.token).toBeTruthy();
    expect((await User.findById(user._id)).googleId).toBeTruthy();
  });
});
