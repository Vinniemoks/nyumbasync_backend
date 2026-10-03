// Step tokens (password-change / new-IP / MFA) and refresh tokens must never be
// accepted as access tokens, and suspended / inactive accounts must be locked
// out. Regression tests for the new-IP-verification bypass: the session token
// issued after a correct password used to work as a full bearer token.
const jwt = require('jsonwebtoken');

jest.mock('../../models/user.model', () => ({ findById: jest.fn() }));
jest.mock('../../models/lease.model', () => ({}));
jest.mock('../../services/token-blacklist.service', () => ({ isBlacklisted: async () => false }));

const User = require('../../models/user.model');
const { authenticate } = require('../../middlewares/auth.middleware');
const { generateToken, generateRefreshToken } = require('../../utils/auth');
const { PURPOSES } = require('../../utils/token-scope');

const SECRET = process.env.JWT_SECRET;
const baseUser = { _id: 'u1', role: 'super_admin', roles: ['super_admin'], isActive: true, status: 'active' };

function run(token, { user = baseUser, roles = 'any', options } = {}) {
  User.findById.mockImplementation(() => ({ select: () => ({ lean: async () => user }) }));
  const req = { header: () => `Bearer ${token}`, ip: '1.1.1.1', cookies: {} };
  const res = {
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    set() {},
  };
  let nextCalled = false;
  return authenticate(roles, options)(req, res, () => { nextCalled = true; }).then(() => ({ nextCalled, req, res }));
}

const stepToken = (purpose, extra = {}) => jwt.sign({ userId: 'u1', purpose, ...extra }, SECRET, { expiresIn: '5m', algorithm: 'HS256' });

describe('step tokens are not access tokens', () => {
  test.each([
    ['new-IP session token', () => stepToken(PURPOSES.IP_VERIFICATION, { expectedIp: '9.9.9.9' })],
    ['password-change token', () => stepToken(PURPOSES.PASSWORD_CHANGE)],
    ['MFA step-up token', () => stepToken(PURPOSES.MFA_STEP_UP)],
    ['refresh token', () => generateRefreshToken('u1')],
    ['token with an unknown type claim', () => jwt.sign({ userId: 'u1', type: 'whatever' }, SECRET, { algorithm: 'HS256' })],
  ])('%s is rejected by authenticate()', async (_name, make) => {
    const { nextCalled, res } = await run(make());
    expect(nextCalled).toBe(false);
    expect(res.code).toBe(401);
  });

  test('a real access token still works', async () => {
    const { nextCalled, req } = await run(generateToken({ id: 'u1', role: 'super_admin', phone: '254700000000' }));
    expect(nextCalled).toBe(true);
    expect(req.tokenPurpose).toBeUndefined();
  });

  test('tokens signed with another algorithm are rejected', async () => {
    const t = jwt.sign({ userId: 'u1' }, SECRET, { algorithm: 'HS512' });
    const { nextCalled, res } = await run(t);
    expect(nextCalled).toBe(false);
    expect(res.code).toBe(401);
  });
});

describe('routes that opt in to a step token', () => {
  const opts = { options: { allowPurposes: [PURPOSES.PASSWORD_CHANGE] } };

  test('accept exactly the purposes they list', async () => {
    const ok = await run(stepToken(PURPOSES.PASSWORD_CHANGE), opts);
    expect(ok.nextCalled).toBe(true);
    expect(ok.req.tokenPurpose).toBe(PURPOSES.PASSWORD_CHANGE);

    const other = await run(stepToken(PURPOSES.IP_VERIFICATION), opts);
    expect(other.nextCalled).toBe(false);
    expect(other.res.code).toBe(401);
  });

  test('still accept normal access tokens', async () => {
    const r = await run(generateToken({ id: 'u1', role: 'tenant', phone: '254700000000' }), opts);
    expect(r.nextCalled).toBe(true);
  });

  test('never count on a route that requires a role', async () => {
    const r = await run(stepToken(PURPOSES.PASSWORD_CHANGE), { ...opts, roles: ['admin'] });
    expect(r.nextCalled).toBe(false);
    expect(r.res.code).toBe(403);
  });

  test('are dead once the password has changed (tokenValidAfter)', async () => {
    const t = stepToken(PURPOSES.PASSWORD_CHANGE);
    const user = { ...baseUser, tokenValidAfter: new Date(Date.now() + 1000) };
    const r = await run(t, { ...opts, user });
    expect(r.nextCalled).toBe(false);
    expect(r.res.code).toBe(401);
  });
});

describe('revocation is exact to the millisecond', () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  test('a token issued after the cutoff works even in the same second; one issued before does not', async () => {
    const before = generateToken({ id: 'u1', role: 'super_admin', phone: '254700000000' });
    await sleep(15);
    const cutoff = new Date(); // e.g. a password change
    await sleep(15);
    const after = generateToken({ id: 'u1', role: 'super_admin', phone: '254700000000' });
    const user = { ...baseUser, tokenValidAfter: cutoff };

    expect((await run(after, { user })).nextCalled).toBe(true);
    const old = await run(before, { user });
    expect(old.nextCalled).toBe(false);
    expect(old.res.code).toBe(401);
  });

  test('the refresh token carries the same precision', () => {
    const decoded = jwt.decode(generateRefreshToken('u1'));
    expect(decoded.type).toBe('refresh');
    expect(Number.isInteger(decoded.iat)).toBe(false);
  });
});

describe('locked accounts', () => {
  const token = () => generateToken({ id: 'u1', role: 'super_admin', phone: '254700000000' });

  test.each([
    ['suspended', { status: 'suspended' }, /suspended/i],
    ['inactive status', { status: 'inactive' }, /inactive/i],
    ['isActive false', { isActive: false }, /inactive/i],
  ])('%s accounts get 403', async (_n, patch, msg) => {
    const { nextCalled, res } = await run(token(), { user: { ...baseUser, ...patch } });
    expect(nextCalled).toBe(false);
    expect(res.code).toBe(403);
    expect(res.body.error).toMatch(msg);
  });

  test('accounts with no status field (older users) are treated as active', async () => {
    const { status, ...legacy } = baseUser;
    const r = await run(token(), { user: legacy });
    expect(r.nextCalled).toBe(true);
  });

  test('tokens issued before the revoke time are rejected', async () => {
    const t = token();
    const r = await run(t, { user: { ...baseUser, tokenValidAfter: new Date(Date.now() + 1000) } });
    expect(r.nextCalled).toBe(false);
    expect(r.res.code).toBe(401);
  });
});
