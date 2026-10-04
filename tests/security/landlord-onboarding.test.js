// A landlord adds a tenant to one of their units and opens the lease in one step.
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../server').app;
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Lease = require('../../models/lease.model');
const activation = require('../../services/activation.service');

const PASSWORD = 'Correct-Horse-9!';
let mongoServer;
let seq = 0;

const phone = () => `2547${String(20000000 + seq++)}`;
const makeUser = (role, extra = {}) =>
  User.create({
    firstName: 'Test', lastName: role, email: `${role}${seq}.${Date.now()}@example.com`,
    phone: phone(), password: PASSWORD, role, ...extra,
  });
const tokenFor = async (user) =>
  (await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD })).body.token;
const makeProperty = (landlord, extra = {}) =>
  Property.create({
    title: 'Palm Court', type: 'apartment', bedrooms: 2, bathrooms: 1,
    description: 'Eight-unit apartment block close to the highway, with parking, water and security.',
    address: { street: 'Ngong Road', area: 'Kilimani', city: 'Nairobi', county: 'Nairobi' },
    rent: { amount: 42000 }, deposit: 42000, landlord: landlord._id,
    houses: [{ houseNumber: 'A1', rent: 30000 }, { houseNumber: 'A2' }],
    ...extra,
  });
const add = (token, body) => request(app).post('/api/v1/landlord/tenants').set('Authorization', `Bearer ${token}`).send(body);
const valid = (property, extra = {}) => ({
  propertyId: String(property._id), houseNumber: 'A1',
  firstName: 'Nia', lastName: 'Wanjiru', email: `nia${seq++}@example.com`, phone: '0722123456', ...extra,
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
beforeEach(async () => {
  jest.spyOn(activation, 'sendActivationEmail').mockResolvedValue(true);
  await Promise.all([User.deleteMany({}), Property.deleteMany({}), Lease.deleteMany({})]);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /landlord/tenants', () => {
  test('creates the tenant account, an active lease, and marks the unit occupied', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const body = valid(property);
    const res = await add(await tokenFor(landlord), body).expect(201);

    expect(res.body.newAccount).toBe(true);
    expect(res.body.activationEmailSent).toBe(true);
    expect(res.body.initialPassword).toEqual(expect.any(String));
    // unit A1 has its own rent (30,000), which is the default
    expect(res.body.lease).toMatchObject({ status: 'active', unit: 'A1', rentAmount: 30000, depositAmount: 42000, rentDueDate: 5 });

    const tenant = await User.findOne({ email: body.email.toLowerCase() }).select('+password');
    expect(tenant).toMatchObject({ role: 'tenant', requirePasswordChange: true, isAdminProvisioned: true });
    expect(tenant.phone).toBe('254722123456');
    expect(String(tenant.createdBy)).toBe(String(landlord._id));
    expect(tenant.password).not.toBe(res.body.initialPassword); // only a hash is stored

    const lease = await Lease.findById(res.body.lease.id);
    expect(String(lease.landlord)).toBe(String(landlord._id));
    expect(String(lease.tenant)).toBe(String(tenant._id));
    const after = await Property.findById(property._id);
    const a1 = after.houses.find((h) => h.houseNumber === 'A1');
    expect(a1.status).toBe('occupied');
    expect(String(a1.tenant)).toBe(String(tenant._id));
    expect(after.houses.find((h) => h.houseNumber === 'A2').status).toBe('available');

    // The new tenant can sign in with the temporary password but must change it first.
    const login = await request(app).post('/api/v1/auth/login').send({ identifier: body.email, password: res.body.initialPassword });
    expect(login.body.requirePasswordChange).toBe(true);
    expect(login.body.token).toBeTruthy();
  });

  test('an existing tenant account is reused and no new password is issued', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const tenant = await makeUser('tenant');
    const res = await add(await tokenFor(landlord), valid(property, { email: tenant.email, phone: tenant.phone, houseNumber: 'A2', rentAmount: 25000 })).expect(201);
    expect(res.body.newAccount).toBe(false);
    expect(res.body.initialPassword).toBeUndefined();
    expect(res.body.activationEmailSent).toBeNull();
    expect(res.body.tenant.id).toBe(String(tenant._id));
    expect(res.body.lease.rentAmount).toBe(25000);
    expect(await User.countDocuments({ role: 'tenant' })).toBe(1);
  });

  test("another landlord's property is not found, and no account is created", async () => {
    const mine = await makeUser('landlord');
    const theirs = await makeUser('landlord');
    const property = await makeProperty(theirs);
    const body = valid(property);
    await add(await tokenFor(mine), body).expect(404);
    expect(await User.countDocuments({ email: body.email })).toBe(0);
    expect(await Lease.countDocuments({})).toBe(0);
  });

  test('refuses an email that belongs to a non-tenant account', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const agent = await makeUser('agent');
    await add(await tokenFor(landlord), valid(property, { email: agent.email, phone: '0733111222' })).expect(409);
    expect(await Lease.countDocuments({})).toBe(0);
  });

  test('refuses a unit that is already let', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const token = await tokenFor(landlord);
    await add(token, valid(property)).expect(201);
    const second = await add(token, valid(property, { phone: '0711999888' }));
    expect(second.status).toBe(409);
    expect(await Lease.countDocuments({ status: 'active' })).toBe(1);
  });

  test('requires the unit when the property has units, and knows which exist', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const token = await tokenFor(landlord);
    await add(token, valid(property, { houseNumber: undefined })).expect(400);
    await add(token, valid(property, { houseNumber: 'Z9' })).expect(404);
  });

  test('a property with no units is let as a whole', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord, { houses: [] });
    const token = await tokenFor(landlord);
    await add(token, valid(property, { houseNumber: undefined })).expect(201);
    expect((await Property.findById(property._id)).status).toBe('occupied');
    await add(token, valid(property, { houseNumber: undefined, phone: '0711999888' })).expect(409);
  });

  test('validates its input', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const token = await tokenFor(landlord);
    await add(token, { propertyId: String(property._id) }).expect(400);
    await add(token, valid(property, { email: 'not-an-email' })).expect(400);
    await add(token, valid(property, { phone: '123' })).expect(400);
    await add(token, valid(property, { rentAmount: 0 })).expect(400);
    await add(token, valid(property, { startDate: '2026-06-01', endDate: '2026-05-01' })).expect(400);
    await add(token, valid(property, { durationMonths: 999 })).expect(400);
    expect(await Lease.countDocuments({})).toBe(0);
  });

  test('only landlords can use it', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const tenant = await makeUser('tenant');
    await add(await tokenFor(tenant), valid(property)).expect(403);
    await request(app).post('/api/v1/landlord/tenants').send(valid(property)).expect(401);
  });

  test('a future start date opens a pending lease', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const next = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    const res = await add(await tokenFor(landlord), valid(property, { startDate: next })).expect(201);
    expect(res.body.lease.status).toBe('pending');
  });
});

describe('ending and renewing a lease', () => {
  test('terminating frees the unit so it can be let again', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const token = await tokenFor(landlord);
    const first = await add(token, valid(property)).expect(201);

    await request(app).post(`/api/v1/leases/${first.body.lease.id}/terminate`).set('Authorization', `Bearer ${token}`).send({ reason: 'Moved out' }).expect(200);
    const after = await Property.findById(property._id);
    expect(after.houses.find((h) => h.houseNumber === 'A1').status).toBe('available');

    await add(token, valid(property, { phone: '0711999888' })).expect(201);
  });

  test("a landlord cannot renew or open leases on another landlord's property", async () => {
    const mine = await makeUser('landlord');
    const theirs = await makeUser('landlord');
    const property = await makeProperty(theirs);
    const theirToken = await tokenFor(theirs);
    const made = await add(theirToken, valid(property)).expect(201);
    const myToken = await tokenFor(mine);

    await request(app).post(`/api/v1/leases/${made.body.lease.id}/renew`).set('Authorization', `Bearer ${myToken}`).send({ durationMonths: 12 }).expect(403);
    await request(app).post('/api/v1/leases').set('Authorization', `Bearer ${myToken}`)
      .send({ propertyId: String(property._id), tenantId: String((await makeUser('tenant'))._id), monthlyRent: 1000 }).expect(404);
  });

  test('the owner can renew', async () => {
    const landlord = await makeUser('landlord');
    const property = await makeProperty(landlord);
    const token = await tokenFor(landlord);
    const made = await add(token, valid(property)).expect(201);
    const res = await request(app).post(`/api/v1/leases/${made.body.lease.id}/renew`).set('Authorization', `Bearer ${token}`).send({ durationMonths: 6, rentAmount: 33000 }).expect(200);
    expect(res.body.terms.rentAmount).toBe(33000);
    expect(res.body.status).toBe('active');
  });
});
