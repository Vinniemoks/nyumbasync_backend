// Admin user management: list filters, creation with an activation email,
// resending it, status changes that really lock accounts, and the guards that
// stop an admin locking themselves (or the last super admin) out.
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../server').app;
const User = require('../../models/user.model');
const { generateToken } = require('../../utils/auth');
const templatedEmail = require('../../services/email.service');
const Vendor = require('../../models/vendor.model');

const PASSWORD = 'Correct-Horse-9!';
let mongoServer;
let seq = 0;
let sent; // emails the activation service tried to send

const makeUser = (role, extra = {}) => {
  const n = seq++;
  return User.create({
    firstName: 'T', lastName: role, email: `${role}${n}.${Date.now()}@example.com`,
    phone: `2547${String(20000000 + n)}`, password: PASSWORD, role, ...extra,
  });
};
const tokenFor = (u) => generateToken({ id: u._id, role: u.role, phone: u.phone });
const as = (u) => ({ Authorization: `Bearer ${tokenFor(u)}` });
const linkTokenFrom = (mail) => new URL(mail.data.activationUrl).searchParams.get('token');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
beforeEach(async () => {
  sent = [];
  jest.spyOn(templatedEmail, 'sendEmail').mockImplementation(async (to, subject, template, data) => {
    sent.push({ to, subject, template, data });
    return true;
  });
  await User.deleteMany({});
  await Vendor.deleteMany({});
});
afterEach(() => jest.restoreAllMocks());

const newStaff = (over = {}) => ({
  email: `new.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`,
  phone: `2547${String(30000000 + Math.floor(Math.random() * 9999999))}`,
  firstName: 'Neo', lastName: 'Hire', role: 'landlord', ...over,
});

describe('who may use the user-management endpoints', () => {
  test.each([['viewer'], ['support_admin'], ['finance_admin'], ['tenant']])('%s cannot create or edit users', async (role) => {
    const actor = await makeUser(role);
    const victim = await makeUser('tenant');
    const created = await request(app).post('/api/v1/admin/users').set(as(actor)).send(newStaff());
    expect([401, 403]).toContain(created.status);
    const edited = await request(app).patch(`/api/v1/admin/users/${victim._id}`).set(as(actor)).send({ status: 'suspended' });
    expect([401, 403]).toContain(edited.status);
    expect((await User.findById(victim._id)).status).toBe('active');
  });

  test('an admin cannot create admin-level accounts; a super admin can', async () => {
    const admin = await makeUser('admin');
    const superAdmin = await makeUser('super_admin');
    await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff({ role: 'admin' })).expect(403);
    await request(app).post('/api/v1/admin/users').set(as(superAdmin)).send(newStaff({ role: 'admin' })).expect(201);
  });
});

describe('listing users', () => {
  test('filters by status and role, and returns the fields the admin pages need — and no secrets', async () => {
    const admin = await makeUser('super_admin');
    await makeUser('tenant', { status: 'suspended', isActive: false });
    await makeUser('tenant');
    const staff = await makeUser('admin', {
      loginIps: ['10.0.0.1', '10.0.0.2'],
      knownIps: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }],
      ipVerificationCodeExpiry: new Date(Date.now() + 60000),
      mfaSecret: 'TOPSECRET', activationToken: 'hashed-token',
    });

    const suspended = (await request(app).get('/api/v1/admin/users?status=suspended').set(as(admin)).expect(200)).body;
    expect(suspended.users).toHaveLength(1);
    expect(suspended.users[0].status).toBe('suspended');

    const active = (await request(app).get('/api/v1/admin/users?status=active').set(as(admin)).expect(200)).body;
    expect(active.users.every((u) => u.status === 'active')).toBe(true);

    await request(app).get('/api/v1/admin/users?status=banana').set(as(admin)).expect(400);

    const admins = (await request(app).get('/api/v1/admin/users?role=admin').set(as(admin)).expect(200)).body.users;
    const row = admins.find((u) => u.id === String(staff._id));
    expect(row.lastLoginIp).toBe('10.0.0.2');
    expect(row.knownIpCount).toBe(2);
    expect(row.ipVerificationPending).toBe(true);
    expect(row.createdAt).toBeTruthy();
    const text = JSON.stringify(admins);
    for (const secret of ['TOPSECRET', 'hashed-token', 'password', 'mfaSecret', 'activationToken']) {
      expect(text).not.toContain(secret);
    }
  });

  test('combines search, role and status filters', async () => {
    const admin = await makeUser('super_admin');
    await makeUser('tenant', { firstName: 'Wanjiku', status: 'suspended', isActive: false });
    await makeUser('tenant', { firstName: 'Wanjiku' });
    await makeUser('landlord', { firstName: 'Wanjiku', status: 'suspended', isActive: false });
    const r = (await request(app).get('/api/v1/admin/users?search=wanjiku&role=tenant&status=suspended').set(as(admin)).expect(200)).body;
    expect(r.users).toHaveLength(1);
  });
});

describe('creating a user and activating the account', () => {
  test('emails a single-use link; the stored token is hashed; the person must change their password', async () => {
    const admin = await makeUser('super_admin');
    const res = await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff()).expect(201);
    expect(res.body.activationEmailSent).toBe(true);
    expect(res.body.initialPassword).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0].template).toBe('account-activation');

    const raw = linkTokenFrom(sent[0]);
    const stored = await User.findOne({ email: sent[0].to }).select('+activationToken');
    expect(stored.activationToken).toBeTruthy();
    expect(stored.activationToken).not.toBe(raw);
    expect(stored.isAdminProvisioned).toBe(true);
    expect(stored.requirePasswordChange).toBe(true);
    expect(stored.emailVerified).toBe(false);
    expect(String(stored.createdBy)).toBe(String(admin._id));

    await request(app).post('/api/v1/auth/activate').send({ token: raw }).expect(200);
    expect((await User.findById(stored._id)).emailVerified).toBe(true);
    await request(app).post('/api/v1/auth/activate').send({ token: raw }).expect(400); // single use
  });

  test('an expired link is refused', async () => {
    const admin = await makeUser('super_admin');
    await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff()).expect(201);
    const raw = linkTokenFrom(sent[0]);
    await User.updateOne({ email: sent[0].to }, { activationExpires: new Date(Date.now() - 1000) });
    await request(app).post('/api/v1/auth/activate').send({ token: raw }).expect(400);
  });

  test('if the email cannot be sent the user is still created and the admin is told', async () => {
    templatedEmail.sendEmail.mockResolvedValue({ success: false, message: 'Email not configured' });
    const admin = await makeUser('super_admin');
    const res = await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff()).expect(201);
    expect(res.body.activationEmailSent).toBe(false);
    expect(await User.countDocuments({ email: res.body.user.email })).toBe(1);

    templatedEmail.sendEmail.mockRejectedValue(new Error('smtp down'));
    const res2 = await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff()).expect(201);
    expect(res2.body.activationEmailSent).toBe(false);
  });

  test('duplicate email or phone is a 409', async () => {
    const admin = await makeUser('super_admin');
    const body = newStaff();
    await request(app).post('/api/v1/admin/users').set(as(admin)).send(body).expect(201);
    await request(app).post('/api/v1/admin/users').set(as(admin)).send({ ...body, phone: '254799999999' }).expect(409);
  });
});

describe('resending the activation link', () => {
  const pending = async (admin) => {
    await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff()).expect(201);
    return User.findOne({ email: sent[0].to });
  };

  test('admin resend replaces the old link, and is rate limited', async () => {
    const admin = await makeUser('super_admin');
    const user = await pending(admin);
    const oldToken = linkTokenFrom(sent[0]);

    // too soon after creation
    const early = await request(app).post(`/api/v1/admin/users/${user._id}/resend-activation`).set(as(admin)).expect(429);
    expect(early.body.retryAfterSeconds).toBeGreaterThan(0);

    await User.updateOne({ _id: user._id }, { activationSentAt: new Date(Date.now() - 120000) });
    const res = await request(app).post(`/api/v1/admin/users/${user._id}/resend-activation`).set(as(admin)).expect(200);
    expect(res.body.emailSent).toBe(true);
    expect(sent).toHaveLength(2);

    const newToken = linkTokenFrom(sent[1]);
    expect(newToken).not.toBe(oldToken);
    await request(app).post('/api/v1/auth/activate').send({ token: oldToken }).expect(400);
    await request(app).post('/api/v1/auth/activate').send({ token: newToken }).expect(200);
  });

  test('an already-activated account answers 409', async () => {
    const admin = await makeUser('super_admin');
    const user = await pending(admin);
    await User.updateOne({ _id: user._id }, { emailVerified: true });
    await request(app).post(`/api/v1/admin/users/${user._id}/resend-activation`).set(as(admin)).expect(409);
  });

  test('an admin cannot resend for an admin-level account', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('admin', { isAdminProvisioned: true, emailVerified: false });
    await request(app).post(`/api/v1/admin/users/${staff._id}/resend-activation`).set(as(admin)).expect(403);
  });

  test('the public endpoint answers the same for unknown, active and pending addresses', async () => {
    const admin = await makeUser('super_admin');
    const user = await pending(admin);
    await User.updateOne({ _id: user._id }, { activationSentAt: new Date(Date.now() - 120000) });
    const active = await makeUser('tenant');

    const answers = [];
    for (const email of ['nobody@example.com', active.email, user.email]) {
      const r = await request(app).post('/api/v1/auth/resend-activation').send({ email }).expect(200);
      answers.push(r.body);
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[1]).toEqual(answers[2]);
    // only the pending one actually got an email (1 from creation + 1 resend)
    expect(sent.filter((m) => m.to === user.email)).toHaveLength(2);
    expect(sent.filter((m) => m.to === active.email)).toHaveLength(0);

    // immediately again: cool-down, no second email
    await request(app).post('/api/v1/auth/resend-activation').send({ email: user.email }).expect(200);
    expect(sent.filter((m) => m.to === user.email)).toHaveLength(2);

    await request(app).post('/api/v1/auth/resend-activation').send({ email: 'not-an-email' }).expect(400);
  });
});

describe('changing status really locks the account', () => {
  test('suspend revokes the live session at once; unsuspend lets them back in', async () => {
    const admin = await makeUser('super_admin');
    const user = await makeUser('tenant');
    const token = tokenFor(user);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    const res = await request(app).patch(`/api/v1/admin/users/${user._id}`).set(as(admin)).send({ status: 'suspended' }).expect(200);
    expect(res.body.user.isActive).toBe(false);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(403);

    await request(app).patch(`/api/v1/admin/users/${user._id}`).set(as(admin)).send({ status: 'active' }).expect(200);
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(200);
    // the old token stays dead (revoked at suspension time)
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  test('an invalid status is rejected', async () => {
    const admin = await makeUser('super_admin');
    const user = await makeUser('tenant');
    await request(app).patch(`/api/v1/admin/users/${user._id}`).set(as(admin)).send({ status: 'banned' }).expect(400);
  });

  test('an admin who sets someone\'s password forces a change and ends their sessions', async () => {
    const admin = await makeUser('super_admin');
    const user = await makeUser('tenant');
    const old = tokenFor(user);
    await request(app).patch(`/api/v1/admin/users/${user._id}`).set(as(admin)).send({ password: 'Temp-Pass-12345' }).expect(200);
    const stored = await User.findById(user._id);
    expect(stored.requirePasswordChange).toBe(true);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${old}`).expect(401);
    const login = await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'Temp-Pass-12345' }).expect(200);
    expect(login.body.requirePasswordChange).toBe(true);
  });

  test('a changed email must not collide with another account', async () => {
    const admin = await makeUser('super_admin');
    const a = await makeUser('tenant');
    const b = await makeUser('tenant');
    await request(app).patch(`/api/v1/admin/users/${a._id}`).set(as(admin)).send({ email: b.email }).expect(409);
  });
});

describe('guards against locking yourself out', () => {
  test('nobody can deactivate or re-role themselves', async () => {
    const root = await makeUser('super_admin');
    await makeUser('super_admin'); // a second one, so only the self rule applies
    await request(app).patch(`/api/v1/admin/users/${root._id}`).set(as(root)).send({ status: 'suspended' }).expect(403);
    await request(app).patch(`/api/v1/admin/users/${root._id}`).set(as(root)).send({ role: 'admin' }).expect(403);
    await request(app).patch(`/api/v1/admin/users/${root._id}`).set(as(root)).send({ firstName: 'Renamed' }).expect(200);
  });

  test('an admin cannot modify an admin account or a super admin', async () => {
    const admin = await makeUser('admin');
    const peer = await makeUser('admin');
    const root = await makeUser('super_admin');
    await request(app).patch(`/api/v1/admin/users/${peer._id}`).set(as(admin)).send({ status: 'suspended' }).expect(403);
    await request(app).patch(`/api/v1/admin/users/${root._id}`).set(as(admin)).send({ status: 'suspended' }).expect(403);
  });
});

describe('bulk status', () => {
  test('applies to the allowed accounts and reports why others were skipped', async () => {
    const root = await makeUser('super_admin');
    const t1 = await makeUser('tenant');
    const t2 = await makeUser('landlord');
    const already = await makeUser('tenant', { status: 'suspended', isActive: false });
    const ghost = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post('/api/v1/admin/users/bulk-status').set(as(root))
      .send({ action: 'suspend', userIds: [t1._id, t2._id, already._id, root._id, ghost] })
      .expect(200);
    expect(res.body.updated).toBe(2);
    const reasons = Object.fromEntries(res.body.skipped.map((s) => [s.id, s.reason]));
    expect(reasons[String(already._id)]).toBe('already_suspended');
    expect(reasons[String(root._id)]).toBe('self');
    expect(reasons[String(ghost)]).toBe('not_found');

    expect((await User.findById(t1._id)).isActive).toBe(false);
    const back = await request(app)
      .post('/api/v1/admin/users/bulk-status').set(as(root)).send({ action: 'unsuspend', userIds: [t1._id, t2._id] }).expect(200);
    expect(back.body.updated).toBe(2);
    expect((await User.findById(t1._id)).status).toBe('active');
    expect((await User.findById(t1._id)).isActive).toBe(true);
  });

  test('an admin skips admin accounts, and a super admin skips themselves', async () => {
    const admin = await makeUser('admin');
    const peer = await makeUser('admin');
    const t = await makeUser('tenant');
    const r = await request(app).post('/api/v1/admin/users/bulk-status').set(as(admin)).send({ action: 'deactivate', userIds: [peer._id, t._id] }).expect(200);
    expect(r.body.updated).toBe(1);
    expect(r.body.skipped).toEqual([{ id: String(peer._id), reason: 'admin_account' }]);

    const s1 = await makeUser('super_admin');
    const s2 = await makeUser('super_admin');
    const operator = await makeUser('super_admin');
    const both = await request(app).post('/api/v1/admin/users/bulk-status').set(as(operator)).send({ action: 'suspend', userIds: [s1._id, s2._id, operator._id] }).expect(200);
    expect(both.body.skipped.map((s) => s.reason)).toEqual(['self']);
    expect(both.body.updated).toBe(2);
    expect((await User.findById(operator._id)).status).toBe('active');
  });

  test('validates input', async () => {
    const root = await makeUser('super_admin');
    await request(app).post('/api/v1/admin/users/bulk-status').set(as(root)).send({ action: 'nuke', userIds: [root._id] }).expect(400);
    await request(app).post('/api/v1/admin/users/bulk-status').set(as(root)).send({ action: 'suspend', userIds: [] }).expect(400);
    await request(app).post('/api/v1/admin/users/bulk-status').set(as(root)).send({ action: 'suspend', userIds: ['nope'] }).expect(400);
    await request(app).post('/api/v1/admin/users/bulk-status').set(as(root)).send({ action: 'suspend', userIds: Array(101).fill(String(root._id)) }).expect(400);
  });
});

describe('vendor services', () => {
  const vendorBody = (over = {}) => newStaff({ role: 'vendor', ...over });

  test('creating a vendor saves their services on a linked vendor profile', async () => {
    const admin = await makeUser('super_admin');
    const res = await request(app).post('/api/v1/admin/users').set(as(admin)).send(vendorBody({ serviceTypes: ['plumbing', 'hvac', 'painting'] })).expect(201);
    expect(res.body.vendorProfile).toBe(true);
    const profile = await Vendor.findOne({ user: res.body.user.id });
    expect(profile.services.sort()).toEqual(['hvac', 'painting', 'plumbing']);
    expect(profile.company).toContain('Neo');
    expect(profile.contact).toMatch(/^254[17]\d{8}$/);
  });

  test('an unknown service is a 400 and nothing is created', async () => {
    const admin = await makeUser('super_admin');
    const body = vendorBody({ serviceTypes: ['plumbing', 'time-travel'] });
    const res = await request(app).post('/api/v1/admin/users').set(as(admin)).send(body).expect(400);
    expect(res.body.error).toMatch(/time-travel/);
    expect(res.body.allowed).toContain('plumbing');
    expect(await User.countDocuments({ email: body.email })).toBe(0);
    expect(await Vendor.countDocuments()).toBe(0);
  });

  test('a vendor with no services still gets a profile; non-vendors never do', async () => {
    const admin = await makeUser('super_admin');
    const v = await request(app).post('/api/v1/admin/users').set(as(admin)).send(vendorBody()).expect(201);
    expect((await Vendor.findOne({ user: v.body.user.id })).services).toEqual([]);

    const t = await request(app).post('/api/v1/admin/users').set(as(admin)).send(newStaff({ role: 'tenant', serviceTypes: ['plumbing'] })).expect(201);
    expect(t.body.vendorProfile).toBeUndefined();
    expect(await Vendor.countDocuments({ user: t.body.user.id })).toBe(0);
  });

  test('the user list returns a vendor\'s services so the edit form can show them', async () => {
    const admin = await makeUser('super_admin');
    const v = await request(app).post('/api/v1/admin/users').set(as(admin)).send(vendorBody({ serviceTypes: ['carpentry'] })).expect(201);
    await makeUser('tenant');
    const list = (await request(app).get('/api/v1/admin/users').set(as(admin)).expect(200)).body.users;
    expect(list.find((u) => u.id === v.body.user.id).serviceTypes).toEqual(['carpentry']);
    expect(list.filter((u) => u.role === 'tenant').every((u) => u.serviceTypes === undefined)).toBe(true);
  });

  test('editing updates the services; leaving them out keeps what was there', async () => {
    const admin = await makeUser('super_admin');
    const v = await request(app).post('/api/v1/admin/users').set(as(admin)).send(vendorBody({ serviceTypes: ['plumbing'] })).expect(201);
    const id = v.body.user.id;

    await request(app).patch(`/api/v1/admin/users/${id}`).set(as(admin)).send({ serviceTypes: ['electrical', 'security'] }).expect(200);
    expect((await Vendor.findOne({ user: id })).services.sort()).toEqual(['electrical', 'security']);

    await request(app).patch(`/api/v1/admin/users/${id}`).set(as(admin)).send({ firstName: 'Renamed' }).expect(200);
    expect((await Vendor.findOne({ user: id })).services.sort()).toEqual(['electrical', 'security']);

    await request(app).patch(`/api/v1/admin/users/${id}`).set(as(admin)).send({ serviceTypes: ['nope'] }).expect(400);
    expect((await Vendor.findOne({ user: id })).services.sort()).toEqual(['electrical', 'security']);
    // still only one profile
    expect(await Vendor.countDocuments({ user: id })).toBe(1);
  });

  test('services sent for a non-vendor account are ignored', async () => {
    const admin = await makeUser('super_admin');
    const t = await makeUser('tenant');
    await request(app).patch(`/api/v1/admin/users/${t._id}`).set(as(admin)).send({ serviceTypes: ['plumbing'] }).expect(200);
    expect(await Vendor.countDocuments({ user: t._id })).toBe(0);
  });
});

describe('retired endpoint', () => {
  test('POST /admin/users/manage is gone (use PATCH /admin/users/:id or bulk-status)', async () => {
    const admin = await makeUser('super_admin');
    const t = await makeUser('tenant');
    const r = await request(app).post('/api/v1/admin/users/manage').set(as(admin)).send({ action: 'update-status', userId: String(t._id), status: 'suspended' });
    expect(r.status).toBe(404);
    expect((await User.findById(t._id)).status).toBe('active');
  });
});
