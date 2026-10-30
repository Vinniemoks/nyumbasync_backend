const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server').app;
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');
const TenantInvite = require('../models/tenant-invite.model');
const emailService = require('../services/email.service');
const { makeUser, makeProperty } = require('./helpers/factories');

let mongoServer, landlord, tenantUser, property, sentMail;

const invitee = (over = {}) => ({
  firstName: 'Amina', lastName: 'Otieno', email: 'amina@example.com', phone: '0712345678',
  houseNumber: 'A4', ...over,
});
const tokenFromUrl = (url) => url.split('/onboard/')[1];
const post = (path, token, body) => request(app).post(`/api/v1/onboarding${path}`).set('Authorization', `Bearer ${token}`).send(body);

describe('Tenant onboarding by invitation', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Property.deleteMany({}), Lease.deleteMany({}), TenantInvite.deleteMany({})]);
    landlord = await makeUser('landlord');
    tenantUser = await makeUser('tenant');
    property = await makeProperty(landlord.user._id, {
      floors: 3,
      houses: [
        { houseNumber: 'A4', floor: 2, rent: 25000, status: 'available' },
        { houseNumber: 'A5', floor: 2, rent: 26000, status: 'occupied' },
      ],
    });
    sentMail = [];
    jest.spyOn(emailService, 'sendEmail').mockImplementation(async (to, subject, template, data) => {
      sentMail.push({ to, subject, template, data });
      return true;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const invite = (over = {}, token = landlord.token) =>
    post('/invites', token, { propertyId: String(property._id), ...invitee(over) });

  describe('owner creates an invitation', () => {
    it('emails the client a registration link and returns it once', async () => {
      const res = await invite();
      expect(res.status).toBe(201);
      expect(res.body.emailSent).toBe(true);
      expect(res.body.inviteUrl).toMatch(/\/onboard\/[a-f0-9]{64}$/);
      expect(sentMail).toHaveLength(1);
      expect(sentMail[0]).toMatchObject({ to: 'amina@example.com', template: 'tenant-invitation' });
      expect(sentMail[0].data.unitLabel).toBe('Unit A4 · Floor 2');
      expect(sentMail[0].data.inviteUrl).toBe(res.body.inviteUrl);
      // The token itself is never stored.
      const stored = await TenantInvite.findOne().select('+tokenHash');
      expect(stored.tokenHash).not.toContain(tokenFromUrl(res.body.inviteUrl));
      expect(stored.floor).toBe(2);
      expect(stored.rules.length).toBeGreaterThan(3);
    });

    it('still creates the invite and flags it when the email fails', async () => {
      emailService.sendEmail.mockResolvedValue(false);
      const res = await invite();
      expect(res.status).toBe(201);
      expect(res.body.emailSent).toBe(false);
      expect(res.body.inviteUrl).toBeTruthy();
    });

    it('rejects an occupied unit, an unknown unit, a second pending invite and bad input', async () => {
      expect((await invite({ houseNumber: 'A5' })).status).toBe(409);
      expect((await invite({ houseNumber: 'Z9' })).status).toBe(404);
      expect((await invite({ houseNumber: undefined })).status).toBe(400);
      expect((await invite({ email: 'nope' })).status).toBe(400);
      expect((await invite({ phone: '123' })).status).toBe(400);
      expect((await invite({ durationMonths: 3 })).status).toBe(400);
      expect((await invite()).status).toBe(201);
      expect((await invite({ email: 'other@example.com', phone: '0722222222' })).status).toBe(409);
    });

    it('lets only the property owner, with an owner role, invite', async () => {
      expect((await invite({}, tenantUser.token)).status).toBe(403);
      const other = await makeUser('landlord');
      expect((await invite({}, other.token)).status).toBe(404);
    });

    it('uses the owner\'s edited rules', async () => {
      await invite({ rules: ['No loud music', '  ', 'Lock the gate'] });
      const stored = await TenantInvite.findOne();
      expect(stored.rules).toEqual(['No loud music', 'Lock the gate']);
    });
  });

  describe('client reviews and accepts', () => {
    let rawToken;
    beforeEach(async () => {
      const res = await invite();
      rawToken = tokenFromUrl(res.body.inviteUrl);
    });
    const view = () => request(app).get(`/api/v1/onboarding/invitations/${rawToken}`);
    const accept = (body, token = rawToken) => request(app).post(`/api/v1/onboarding/invitations/${token}/accept`).send(body);
    const good = { password: 'Sunrise2026', signature: 'Amina Otieno', agreeLease: true, agreeRules: true };

    it('shows the lease, rules and unit without logging in', async () => {
      const res = await view();
      expect(res.status).toBe(200);
      const inv = res.body.invitation;
      expect(inv.unitLabel).toBe('Unit A4 · Floor 2');
      expect(inv.terms.rentAmount).toBe(25000);
      expect(inv.agreementSections.map((s) => s.title)).toEqual(expect.arrayContaining(['Parties', 'Rent', 'Termination']));
      expect(inv.rules.length).toBeGreaterThan(3);
      expect(inv.accountExists).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/tokenHash/);
    });

    it('404s a garbage or unknown token', async () => {
      expect((await request(app).get('/api/v1/onboarding/invitations/nope')).status).toBe(404);
      expect((await request(app).get(`/api/v1/onboarding/invitations/${'a'.repeat(64)}`)).status).toBe(404);
    });

    it('requires agreeing to the lease and rules, a signature and a strong password', async () => {
      expect((await accept({ ...good, agreeLease: false })).status).toBe(400);
      expect((await accept({ ...good, agreeRules: false })).status).toBe(400);
      expect((await accept({ ...good, signature: 'A' })).status).toBe(400);
      expect((await accept({ ...good, password: 'short1' })).status).toBe(400);
      expect((await accept({ ...good, password: 'onlyletters' })).status).toBe(400);
      expect(await Lease.countDocuments()).toBe(0);
    });

    it('creates the verified account, an active signed lease, and occupies the unit', async () => {
      const res = await accept(good);
      expect(res.status).toBe(201);
      expect(res.body.newAccount).toBe(true);

      const user = await User.findOne({ email: 'amina@example.com' });
      expect(user.role).toBe('tenant');
      expect(user.emailVerified).toBe(true);

      const lease = await Lease.findOne();
      expect(lease.status).toBe('active');
      expect(lease.unit).toBe('A4');
      expect(String(lease.tenant)).toBe(String(user._id));
      expect(String(lease.landlord)).toBe(String(landlord.user._id));
      expect(lease.signatures.tenant.fullName).toBe('Amina Otieno');
      expect(lease.signatures.landlord.fullName).toBeTruthy();
      expect(lease.agreement.rules.length).toBeGreaterThan(3);
      expect(lease.terms.rentAmount).toBe(25000);

      const p = await Property.findById(property._id);
      const house = p.houses.find((h) => h.houseNumber === 'A4');
      expect(house.status).toBe('occupied');
      expect(String(house.tenant)).toBe(String(user._id));

      // They can now sign in.
      const login = await request(app).post('/api/v1/auth/login').send({ identifier: 'amina@example.com', password: 'Sunrise2026' });
      expect(login.status).toBe(200);
    });

    it('a future start date opens the lease as pending', async () => {
      await TenantInvite.deleteMany({});
      const next = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
      const created = await invite({ startDate: next });
      const t = tokenFromUrl(created.body.inviteUrl);
      expect((await accept(good, t)).status).toBe(201);
      expect((await Lease.findOne()).status).toBe('pending');
    });

    it('cannot be used twice', async () => {
      expect((await accept(good)).status).toBe(201);
      const again = await accept(good);
      expect(again.status).toBe(410);
      expect((await view()).status).toBe(410);
      expect(await Lease.countDocuments()).toBe(1);
    });

    it('refuses when the unit was taken in the meantime', async () => {
      await Property.updateOne({ _id: property._id, 'houses.houseNumber': 'A4' }, { $set: { 'houses.$.status': 'occupied' } });
      const res = await accept(good);
      expect(res.status).toBe(409);
      expect(await Lease.countDocuments()).toBe(0);
      expect((await TenantInvite.findOne()).status).toBe('pending');
    });

    it('an existing tenant account signs with their own password, no second account', async () => {
      await TenantInvite.deleteMany({});
      const existing = await makeUser('tenant', { email: 'amina@example.com', password: 'Existing123!', phone: '254733333333' });
      const created = await invite({ phone: '0733333333' });
      const t = tokenFromUrl(created.body.inviteUrl);
      expect((await request(app).get(`/api/v1/onboarding/invitations/${t}`)).body.invitation.accountExists).toBe(true);
      expect((await accept({ ...good, password: 'WrongPass123' }, t)).status).toBe(401);
      const ok = await accept({ ...good, password: 'Existing123!' }, t);
      expect(ok.status).toBe(201);
      expect(ok.body.newAccount).toBe(false);
      expect(await User.countDocuments({ email: 'amina@example.com' })).toBe(1);
      expect(String((await Lease.findOne()).tenant)).toBe(String(existing.user._id));
    });
  });

  describe('managing invitations', () => {
    it('lists, resends with a new link (old one dies), and cancels', async () => {
      const created = await invite();
      const first = tokenFromUrl(created.body.inviteUrl);
      const id = created.body.invite.id;

      const list = await request(app).get(`/api/v1/onboarding/invites?propertyId=${property._id}`).set('Authorization', `Bearer ${landlord.token}`);
      expect(list.body.invites).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|onboard\//);

      // Resend is rate limited right after sending.
      expect((await post(`/invites/${id}/resend`, landlord.token, {})).status).toBe(429);
      await TenantInvite.updateOne({ _id: id }, { $set: { lastSentAt: new Date(Date.now() - 120000) } });
      const re = await post(`/invites/${id}/resend`, landlord.token, {});
      expect(re.status).toBe(200);
      expect(sentMail).toHaveLength(2);
      expect((await request(app).get(`/api/v1/onboarding/invitations/${first}`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/onboarding/invitations/${tokenFromUrl(re.body.inviteUrl)}`)).status).toBe(200);

      const del = await request(app).delete(`/api/v1/onboarding/invites/${id}`).set('Authorization', `Bearer ${landlord.token}`);
      expect(del.status).toBe(200);
      expect((await request(app).get(`/api/v1/onboarding/invitations/${tokenFromUrl(re.body.inviteUrl)}`)).status).toBe(410);
      // A cancelled unit can be invited again.
      expect((await invite({ email: 'b@example.com', phone: '0744444444' })).status).toBe(201);
    });

    it('expired links read as expired', async () => {
      const created = await invite();
      await TenantInvite.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await request(app).get(`/api/v1/onboarding/invitations/${tokenFromUrl(created.body.inviteUrl)}`);
      expect(res.status).toBe(410);
      expect(res.body.status).toBe('expired');
    });

    it('does not let another owner touch the invite', async () => {
      const created = await invite();
      const other = await makeUser('landlord');
      const r = await post(`/invites/${created.body.invite.id}/resend`, other.token, {});
      expect(r.status).toBe(404);
      const d = await request(app).delete(`/api/v1/onboarding/invites/${created.body.invite.id}`).set('Authorization', `Bearer ${other.token}`);
      expect(d.status).toBe(404);
    });
  });
});
