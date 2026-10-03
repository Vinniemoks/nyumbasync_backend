// The vendor *profile* (company, services offered, areas) is a separate
// document from the vendor's user account; it links to it through `user`.
// Admins creating or editing a user with the vendor role set the services here.

const Vendor = require('../models/vendor.model');

/** Service types a vendor can offer (the Vendor model's enum). */
const SERVICES = Vendor.schema.path('services').caster.enumValues;

const unknownServices = (list) => [...new Set((list || []).filter((s) => !SERVICES.includes(s)))];

/** Normalise a request value to a de-duplicated array of strings (or null if not given). */
const parseServices = (value) => {
  if (value === undefined || value === null) return null;
  const arr = Array.isArray(value) ? value : [value];
  return [...new Set(arr.map(String))];
};

/**
 * Create or update the vendor profile for a vendor user. Only the services (and
 * the contact email) are touched on an existing profile; a new one is seeded
 * from the account (name, phone, email).
 */
async function saveVendorServices(user, services) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  return Vendor.findOneAndUpdate(
    { user: user._id },
    {
      $set: { services, ...(user.email ? { email: user.email } : {}) },
      $setOnInsert: { user: user._id, company: name, contact: user.phone },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

/** Map of userId -> services for the given vendor users (for the admin lists). */
async function servicesByUser(userIds) {
  if (!userIds.length) return new Map();
  const vendors = await Vendor.find({ user: { $in: userIds } }).select('user services').lean();
  return new Map(vendors.map((v) => [String(v.user), v.services || []]));
}

module.exports = { SERVICES, unknownServices, parseServices, saveVendorServices, servicesByUser };
