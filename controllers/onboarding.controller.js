// Invitation-based tenant onboarding.
//
// Owner side (landlord / agent / property manager): invite a client to one unit
// with its lease terms and house rules; the client gets an email link.
// Client side (public, token in the URL): review the e-lease and rules, agree,
// sign, and finish registration — which creates the account and the lease.

const User = require('../models/user.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');
const TenantInvite = require('../models/tenant-invite.model');
const onboarding = require('../services/onboarding.service');
const templatedEmail = require('../services/email.service');
const { occupyUnit } = require('../services/lease-units.service');
const { formatKenyanPhone } = require('../utils/formatters');
const logger = require('../utils/logger');

const OPEN_LEASE_STATUSES = ['draft', 'pending', 'active'];
const ADMIN_ROLES = ['admin', 'super_admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bad = (res, error, status = 400) => res.status(status).json({ error });
const money = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ').trim();

// A date typed without a time means that day in Kenya (UTC+3), not midnight UTC.
const parseDay = (v) => {
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+03:00`) : new Date(s);
};

const formatAddress = (a) => {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.street, a.area, a.city, a.county].filter(Boolean).join(', ');
};

const heldRoles = (u) => (Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role]);
const isAdmin = (user) => heldRoles(user).some((r) => ADMIN_ROLES.includes(r));
const sameId = (a, b) => String(a && a._id ? a._id : a) === String(b && b._id ? b._id : b);

// ---- owner side -----------------------------------------------------------

const summarize = (inv) => ({
  id: inv._id,
  property: inv.property && inv.property._id ? inv.property._id : inv.property,
  unit: inv.unit,
  floor: inv.floor,
  firstName: inv.firstName,
  lastName: inv.lastName,
  email: inv.email,
  phone: inv.phone,
  status: inv.status,
  rentAmount: inv.terms && inv.terms.rentAmount,
  startDate: inv.terms && inv.terms.startDate,
  expiresAt: inv.expiresAt,
  emailSent: inv.emailSent,
  lastSentAt: inv.lastSentAt,
  createdAt: inv.createdAt,
});

/** The invite plus a still-pending lapse check (expired links read as expired). */
async function settle(inv) {
  if (inv && inv.status === 'pending' && inv.expiresAt <= new Date()) {
    inv.status = 'expired';
    await TenantInvite.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'expired' } });
  }
  return inv;
}

/**
 * POST /api/v1/onboarding/invites
 * body: { propertyId, houseNumber?, firstName, lastName, email, phone,
 *         rentAmount?, depositAmount?, startDate?, durationMonths?, rentDueDate?, rules?: string[] }
 */
exports.createInvite = async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = String(b.firstName || '').trim();
    const lastName = String(b.lastName || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!b.propertyId || !firstName || !lastName || !email || !b.phone) {
      return bad(res, 'propertyId, firstName, lastName, email and phone are required');
    }
    if (!EMAIL.test(email)) return bad(res, 'Enter a valid email address');
    const phone = formatKenyanPhone(b.phone);
    if (!phone) return bad(res, 'Invalid Kenyan phone number (must start with 2547 or 2541)');

    const property = await Property.findById(b.propertyId);
    if (!property || (!sameId(property.landlord, req.user._id) && !isAdmin(req.user))) {
      return bad(res, 'Property not found', 404);
    }

    // Which unit?
    const houses = Array.isArray(property.houses) ? property.houses : [];
    let house = null;
    if (houses.length) {
      if (!b.houseNumber) return bad(res, 'Choose the house number to assign');
      house = houses.find((h) => String(h.houseNumber) === String(b.houseNumber));
      if (!house) return bad(res, 'That unit is not on this property', 404);
      if (house.status === 'occupied') return bad(res, 'That unit is already occupied', 409);
    } else if (property.status === 'occupied') {
      return bad(res, 'This property is already occupied', 409);
    }
    const unit = house ? String(house.houseNumber) : undefined;
    const floor = house && house.floor !== undefined ? house.floor : undefined;

    if (await Lease.exists({ property: property._id, status: { $in: OPEN_LEASE_STATUSES }, ...(unit ? { unit } : {}) })) {
      return bad(res, 'There is already an open lease on that unit', 409);
    }
    await TenantInvite.updateMany(
      { property: property._id, status: 'pending', expiresAt: { $lte: new Date() }, ...(unit ? { unit } : {}) },
      { $set: { status: 'expired' } }
    );
    const pending = await TenantInvite.findOne({ property: property._id, status: 'pending', ...(unit ? { unit } : {}) });
    if (pending) {
      return bad(res, `${pending.firstName} ${pending.lastName} has already been invited to that unit. Resend or cancel that invitation first.`, 409);
    }

    // The client may already have a (tenant-only) account; anything else can't be onboarded as a tenant.
    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      if (existing.email !== email) return bad(res, 'That phone number belongs to a different account', 409);
      if (heldRoles(existing).some((r) => r !== 'tenant')) {
        return bad(res, 'That email belongs to an account that is not a tenant', 409);
      }
    }

    // Terms.
    const rentAmount = Number.isFinite(money(b.rentAmount)) ? money(b.rentAmount) : Number((house && house.rent) ?? (property.rent && property.rent.amount));
    if (!Number.isFinite(rentAmount) || rentAmount <= 0) return bad(res, 'A rent amount greater than zero is required');
    const depositRaw = money(b.depositAmount);
    const depositAmount = Number.isFinite(depositRaw) ? depositRaw : Number(property.deposit ?? rentAmount);
    if (!Number.isFinite(depositAmount) || depositAmount < 0) return bad(res, 'Deposit must be zero or more');
    const startDate = b.startDate ? parseDay(b.startDate) : new Date();
    if (Number.isNaN(startDate.getTime())) return bad(res, 'Invalid start date');
    const durationMonths = b.durationMonths ? Number(b.durationMonths) : 12;
    if (!Number.isInteger(durationMonths) || durationMonths < 6 || durationMonths > 24) {
      return bad(res, 'The lease length must be a whole number of months from 6 to 24');
    }
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);
    const rentDueDate = b.rentDueDate ? Number(b.rentDueDate) : 5;
    if (!Number.isInteger(rentDueDate) || rentDueDate < 1 || rentDueDate > 28) {
      return bad(res, 'The rent due day must be from 1 to 28');
    }

    // Rules: the owner's list (trimmed, no blanks), else the defaults.
    let rules = onboarding.DEFAULT_RULES;
    if (b.rules !== undefined) {
      if (!Array.isArray(b.rules)) return bad(res, 'rules must be a list');
      rules = b.rules.map((r) => String(r || '').trim()).filter(Boolean);
      if (rules.length > 40 || rules.some((r) => r.length > 500)) return bad(res, 'Keep rules to 40 items of at most 500 characters');
    }

    const terms = { rentAmount, depositAmount, durationMonths, startDate, endDate, rentDueDate };
    const landlordName = fullName(req.user) || 'Your landlord';
    const { raw, hash } = onboarding.newToken();
    const invite = await TenantInvite.create({
      tokenHash: hash,
      property: property._id,
      unit,
      floor,
      createdBy: req.user._id,
      firstName, lastName, email, phone,
      terms,
      rules,
      agreementSections: onboarding.buildAgreementSections({
        landlordName,
        tenantName: `${firstName} ${lastName}`,
        propertyTitle: property.title,
        address: formatAddress(property.address),
        unit, floor, terms,
      }),
      landlordSignature: { fullName: landlordName, signedAt: new Date(), ipAddress: req.ip },
      expiresAt: new Date(Date.now() + onboarding.INVITE_TTL_MS),
    });

    const emailSent = await onboarding.sendInviteEmail(invite, { landlordName, propertyTitle: property.title }, raw);
    invite.emailSent = emailSent;
    invite.lastSentAt = new Date();
    await invite.save();

    res.status(201).json({
      message: emailSent ? 'Invitation sent' : 'Invitation created, but the email could not be sent. Share the link with the client yourself.',
      emailSent,
      // Shown once so the owner can pass it on (e.g. WhatsApp) if email fails.
      inviteUrl: onboarding.inviteUrl(raw),
      invite: summarize(invite),
    });
  } catch (err) {
    logger.error('Create tenant invite failed:', err);
    res.status(500).json({ error: 'Failed to create the invitation' });
  }
};

/** Invites on properties the caller owns (all of them for admins). ?propertyId=&status= */
exports.listInvites = async (req, res) => {
  try {
    const q = {};
    if (req.query.propertyId) q.property = req.query.propertyId;
    if (req.query.status) q.status = String(req.query.status);
    if (!isAdmin(req.user)) {
      const mine = await Property.find({ landlord: req.user._id }).select('_id').lean();
      const ids = mine.map((p) => String(p._id));
      if (q.property) {
        if (!ids.includes(String(q.property))) return res.json({ invites: [] });
      } else {
        q.property = { $in: mine.map((p) => p._id) };
      }
    }
    await TenantInvite.updateMany({ ...q, status: 'pending', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
    const invites = await TenantInvite.find(q).sort({ createdAt: -1 }).limit(200);
    res.json({ invites: invites.map(summarize) });
  } catch (err) {
    logger.error('List tenant invites failed:', err);
    res.status(500).json({ error: 'Failed to load invitations' });
  }
};

async function ownedInvite(req) {
  const inv = await TenantInvite.findById(req.params.id).select('+tokenHash');
  if (!inv) return null;
  if (isAdmin(req.user)) return inv;
  const owned = await Property.exists({ _id: inv.property, landlord: req.user._id });
  return owned ? inv : null;
}

/** POST /onboarding/invites/:id/resend — new link (the old one stops working) and a new email. */
exports.resendInvite = async (req, res) => {
  try {
    const inv = await ownedInvite(req);
    if (!inv) return bad(res, 'Invitation not found', 404);
    await settle(inv);
    if (inv.status === 'accepted') return bad(res, 'This invitation was already accepted', 409);
    if (inv.status === 'revoked') return bad(res, 'This invitation was cancelled', 409);
    const wait = onboarding.cooldownSeconds(inv);
    if (wait) return res.status(429).json({ error: `Please wait ${wait}s before resending`, retryAfter: wait });

    const { raw, hash } = onboarding.newToken();
    inv.tokenHash = hash;
    inv.status = 'pending';
    inv.expiresAt = new Date(Date.now() + onboarding.INVITE_TTL_MS);
    inv.resendCount += 1;
    const property = await Property.findById(inv.property).select('title').lean();
    inv.emailSent = await onboarding.sendInviteEmail(
      inv,
      { landlordName: fullName(req.user) || 'Your landlord', propertyTitle: property ? property.title : 'your new home' },
      raw
    );
    inv.lastSentAt = new Date();
    await inv.save();
    res.json({
      message: inv.emailSent ? 'Invitation resent' : 'New link created, but the email could not be sent. Share the link yourself.',
      emailSent: inv.emailSent,
      inviteUrl: onboarding.inviteUrl(raw),
      invite: summarize(inv),
    });
  } catch (err) {
    logger.error('Resend tenant invite failed:', err);
    res.status(500).json({ error: 'Failed to resend the invitation' });
  }
};

/** DELETE /onboarding/invites/:id — cancel a pending invitation. */
exports.revokeInvite = async (req, res) => {
  try {
    const inv = await ownedInvite(req);
    if (!inv) return bad(res, 'Invitation not found', 404);
    if (inv.status === 'accepted') return bad(res, 'This invitation was already accepted', 409);
    inv.status = 'revoked';
    await inv.save();
    res.json({ message: 'Invitation cancelled', invite: summarize(inv) });
  } catch (err) {
    logger.error('Revoke tenant invite failed:', err);
    res.status(500).json({ error: 'Failed to cancel the invitation' });
  }
};

// ---- client side (public) -------------------------------------------------

const STATE_MESSAGE = {
  accepted: 'This invitation has already been used. Sign in to continue.',
  revoked: 'This invitation was cancelled. Ask your landlord to send a new one.',
  expired: 'This invitation has expired. Ask your landlord to send a new one.',
};

async function findByToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const inv = await TenantInvite.findOne({ tokenHash: onboarding.sha256(token) }).select('+tokenHash');
  return settle(inv);
}

/** GET /onboarding/invitations/:token — what the client reviews before signing. */
exports.getInvitation = async (req, res) => {
  try {
    const inv = await findByToken(req.params.token);
    if (!inv) return bad(res, 'This invitation link is not valid.', 404);
    if (inv.status !== 'pending') return res.status(410).json({ error: STATE_MESSAGE[inv.status], status: inv.status });

    const [property, owner, existing] = await Promise.all([
      Property.findById(inv.property).select('title address').lean(),
      User.findById(inv.createdBy).select('firstName lastName').lean(),
      User.exists({ email: inv.email }),
    ]);
    res.json({
      invitation: {
        firstName: inv.firstName,
        lastName: inv.lastName,
        email: inv.email,
        phone: inv.phone,
        unit: inv.unit,
        floor: inv.floor,
        unitLabel: onboarding.unitLabel(inv.unit, inv.floor),
        property: { title: property ? property.title : '', address: property ? formatAddress(property.address) : '' },
        landlordName: owner ? fullName(owner) : 'Your landlord',
        terms: inv.terms,
        rules: inv.rules,
        agreementSections: inv.agreementSections,
        expiresAt: inv.expiresAt,
        accountExists: !!existing,
      },
    });
  } catch (err) {
    logger.error('Load tenant invitation failed:', err);
    res.status(500).json({ error: 'Failed to load the invitation' });
  }
};

const strongPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /\d/.test(p);

/**
 * POST /onboarding/invitations/:token/accept
 * body: { password, signature, agreeLease, agreeRules }
 * `password` is the new password for a new account, or the existing password for a client who already has one.
 */
exports.acceptInvitation = async (req, res) => {
  const made = { user: null, lease: null };
  let claimed = null;
  try {
    const b = req.body || {};
    const peek = await findByToken(req.params.token);
    if (!peek) return bad(res, 'This invitation link is not valid.', 404);
    if (peek.status !== 'pending') return res.status(410).json({ error: STATE_MESSAGE[peek.status], status: peek.status });

    if (b.agreeLease !== true) return bad(res, 'You must agree to the lease agreement to continue');
    if (b.agreeRules !== true) return bad(res, 'You must agree to the rules and regulations to continue');
    const signature = String(b.signature || '').trim();
    if (signature.length < 3 || signature.length > 120) return bad(res, 'Type your full name to sign');
    if (typeof b.password !== 'string' || !b.password) return bad(res, 'Enter your password');

    // Is the unit still free?
    const property = await Property.findById(peek.property);
    if (!property) return bad(res, 'This property no longer exists', 404);
    if (peek.unit) {
      const h = (property.houses || []).find((x) => String(x.houseNumber) === String(peek.unit));
      if (!h) return bad(res, 'That unit is no longer on this property', 409);
      if (h.status === 'occupied') return bad(res, 'That unit has since been taken. Ask your landlord.', 409);
    } else if (property.status === 'occupied') {
      return bad(res, 'This property has since been taken. Ask your landlord.', 409);
    }
    if (await Lease.exists({ property: property._id, status: { $in: OPEN_LEASE_STATUSES }, ...(peek.unit ? { unit: peek.unit } : {}) })) {
      return bad(res, 'That unit already has a lease. Ask your landlord.', 409);
    }

    // The account: sign in to an existing tenant account, or create one.
    let tenant = await User.findOne({ email: peek.email }).select('+password');
    if (tenant) {
      if (heldRoles(tenant).some((r) => r !== 'tenant') || tenant.status === 'suspended' || tenant.isActive === false) {
        return bad(res, 'This email belongs to an account that cannot be onboarded as a tenant. Contact your landlord.', 409);
      }
      if (!(await tenant.correctPassword(b.password))) return bad(res, 'That password is not right for your existing account', 401);
    } else {
      if (!strongPassword(b.password)) return bad(res, 'Choose a password of at least 8 characters with letters and numbers');
      if (await User.exists({ phone: peek.phone })) return bad(res, 'That phone number already belongs to another account. Contact your landlord.', 409);
    }

    // Claim the invite so a double-click or a second tab can't accept twice.
    claimed = await TenantInvite.findOneAndUpdate(
      { _id: peek._id, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt: new Date() } },
      { new: true }
    );
    if (!claimed) return res.status(410).json({ error: STATE_MESSAGE.accepted, status: 'accepted' });

    if (!tenant) {
      tenant = await User.create({
        email: peek.email,
        phone: peek.phone,
        firstName: peek.firstName,
        lastName: peek.lastName,
        password: b.password,
        role: 'tenant',
        roles: ['tenant'],
        // They proved they own this address by opening the emailed link.
        emailVerified: true,
        createdBy: peek.createdBy,
      });
      made.user = tenant;
    }

    const now = new Date();
    const t = peek.terms;
    const lease = await Lease.create({
      property: property._id,
      tenant: tenant._id,
      landlord: property.landlord,
      ...(peek.unit ? { unit: peek.unit } : {}),
      startDate: t.startDate,
      endDate: t.endDate,
      terms: {
        rentAmount: t.rentAmount, depositAmount: t.depositAmount, durationMonths: t.durationMonths,
        rentDueDate: t.rentDueDate, terminationNotice: 2, currency: 'KES',
      },
      agreement: { sections: peek.agreementSections, rules: peek.rules, acceptedAt: now },
      signatures: {
        landlord: { signedAt: peek.landlordSignature.signedAt, ipAddress: peek.landlordSignature.ipAddress, signature: peek.landlordSignature.fullName, fullName: peek.landlordSignature.fullName },
        tenant: { signedAt: now, ipAddress: req.ip, signature, fullName: signature },
      },
      status: t.startDate <= now ? 'active' : 'pending',
    });
    made.lease = lease;

    await occupyUnit({
      propertyId: property._id, unit: peek.unit, tenantId: tenant._id,
      leaseStart: t.startDate, leaseEnd: t.endDate, rentDueDate: t.rentDueDate,
    });
    await TenantInvite.updateOne({ _id: peek._id }, { $set: { tenant: tenant._id, lease: lease._id } });

    // Tell the owner (best effort — the signing has already succeeded).
    User.findById(peek.createdBy).select('email firstName').lean().then((owner) => {
      if (!owner || !owner.email) return null;
      return templatedEmail.sendEmail(owner.email, `${peek.firstName} ${peek.lastName} signed the lease for ${onboarding.unitLabel(peek.unit, peek.floor)} - NyumbaSync`, 'generic-notification', {
        recipientName: owner.firstName || 'there',
        message: `${peek.firstName} ${peek.lastName} accepted the house rules, signed the lease for ${onboarding.unitLabel(peek.unit, peek.floor)} at ${property.title}, and completed registration. The unit is now marked occupied.`,
        year: new Date().getFullYear(),
      });
    }).catch((err) => logger.error('Owner notification after tenant signing failed:', err));

    res.status(201).json({
      message: 'Lease signed. Your account is ready — sign in to continue.',
      newAccount: !!made.user,
      email: tenant.email,
      lease: { id: lease._id, status: lease.status, unit: lease.unit, startDate: lease.startDate, endDate: lease.endDate },
    });
  } catch (err) {
    logger.error('Accepting tenant invitation failed:', err);
    // Undo a half-finished acceptance so the client can try the same link again.
    try {
      if (made.lease) await Lease.deleteOne({ _id: made.lease._id });
      if (made.user) await User.deleteOne({ _id: made.user._id });
      if (claimed) await TenantInvite.updateOne({ _id: claimed._id }, { $set: { status: 'pending' }, $unset: { acceptedAt: '' } });
    } catch (cleanupErr) {
      logger.error('Invitation acceptance cleanup failed:', cleanupErr);
    }
    res.status(500).json({ error: 'Could not complete your registration. Please try again.' });
  }
};

/** Default rules, so the owner's form can show them for editing. */
exports.getDefaults = (req, res) => res.json({ rules: onboarding.DEFAULT_RULES });
