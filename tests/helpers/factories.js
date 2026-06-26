// Shared test factories — create valid documents that satisfy the real model
// schemas (models-as-truth), and sign tokens the way the app does.
const User = require('../../models/user.model');
const Property = require('../../models/property.model');
const Lease = require('../../models/lease.model');
const { generateToken } = require('../../utils/auth');

let seq = 10;
const nextPhone = () => `2547${String(seq++).padStart(8, '0')}`;

// Create a user with a unique phone/email and return { user, token }.
const makeUser = async (role = 'tenant', overrides = {}) => {
  const n = seq;
  const user = await User.create({
    email: overrides.email || `${role}${n}@example.com`,
    password: overrides.password || 'Password123!',
    firstName: overrides.firstName || role,
    lastName: overrides.lastName || 'User',
    phone: overrides.phone || nextPhone(),
    role,
    ...overrides
  });
  return { user, token: generateToken({ id: user._id, role: user.role }) };
};

// Create a valid Property owned by landlordId.
const makeProperty = async (landlordId, overrides = {}) => {
  return Property.create({
    title: 'Test Property',
    description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    // Valid GeoJSON Point — the model has a 2dsphere index on address.coordinates.
    address: { street: 'Test St', area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
    rent: { amount: 50000 },
    deposit: 50000,
    subcounty: 'Westlands',
    landlord: landlordId,
    ...overrides
  });
};

// Create a valid active Lease linking tenant + property + landlord.
const makeLease = async (tenantId, propertyId, landlordId, overrides = {}) => {
  return Lease.create({
    property: propertyId,
    tenant: tenantId,
    landlord: landlordId,
    startDate: new Date(2026, 0, 1),
    endDate: new Date(2026, 11, 1),
    status: 'active',
    terms: { durationMonths: 12, rentAmount: 50000, depositAmount: 50000, rentDueDate: 5 },
    ...overrides
  });
};

module.exports = { makeUser, makeProperty, makeLease, generateToken };
