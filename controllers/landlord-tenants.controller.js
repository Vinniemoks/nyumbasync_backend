// Landlord onboarding: add a tenant to one of my units and open their lease in one step.
const crypto = require('crypto');
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');
const activation = require('../services/activation.service');
const { occupyUnit } = require('../services/lease-units.service');
const { formatKenyanPhone } = require('../utils/formatters');
const logger = require('../utils/logger');

const OPEN_LEASE_STATUSES = ['draft', 'pending', 'active'];
const bad = (res, error, status = 400) => res.status(status).json({ error });
const money = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/v1/landlord/tenants
 * body: { propertyId, houseNumber?, firstName, lastName, email, phone,
 *         rentAmount?, depositAmount?, startDate?, endDate?|durationMonths?, rentDueDate? }
 *
 * Creates the tenant account (or reuses an existing tenant account with the same
 * email/phone), creates the lease, and marks the unit occupied. A new account gets
 * a temporary password — returned once — and an activation email.
 */
exports.onboardTenant = async (req, res) => {
  const created = { user: null, lease: null };
  try {
    const b = req.body || {};
    const { propertyId, houseNumber } = b;
    const firstName = String(b.firstName || '').trim();
    const lastName = String(b.lastName || '').trim();
    const email = String(b.email || '').trim().toLowerCase();

    if (!propertyId || !firstName || !lastName || !email || !b.phone) {
      return bad(res, 'propertyId, firstName, lastName, email and phone are required');
    }
    if (!EMAIL.test(email)) return bad(res, 'Enter a valid email address');
    const phone = formatKenyanPhone(b.phone);
    if (!phone) return bad(res, 'Invalid Kenyan phone number (must start with 2547 or 2541)');

    // The property must be one of this landlord's.
    const property = await Property.findOne({ _id: propertyId, landlord: req.user._id });
    if (!property) return bad(res, 'Property not found', 404);

    // Which unit is being let?
    const houses = Array.isArray(property.houses) ? property.houses : [];
    let house = null;
    if (houses.length) {
      if (!houseNumber) return bad(res, 'houseNumber is required for this property');
      house = houses.find((h) => String(h.houseNumber) === String(houseNumber));
      if (!house) return bad(res, 'That unit is not on this property', 404);
      if (house.status === 'occupied') return bad(res, 'That unit is already occupied', 409);
    } else if (property.status === 'occupied') {
      return bad(res, 'This property is already occupied', 409);
    }
    const unit = house ? String(house.houseNumber) : undefined;
    const clash = await Lease.exists({
      property: property._id,
      status: { $in: OPEN_LEASE_STATUSES },
      ...(unit ? { unit } : {}),
    });
    if (clash) return bad(res, 'There is already an open lease on that unit', 409);

    // Money and dates.
    const rentAmount = Number.isFinite(money(b.rentAmount)) ? money(b.rentAmount) : Number(house?.rent ?? property.rent?.amount);
    if (!Number.isFinite(rentAmount) || rentAmount <= 0) return bad(res, 'A rent amount greater than zero is required');
    const depositRaw = money(b.depositAmount);
    const depositAmount = Number.isFinite(depositRaw) ? depositRaw : Number(property.deposit ?? rentAmount);
    if (!Number.isFinite(depositAmount) || depositAmount < 0) return bad(res, 'Deposit must be zero or more');

    const startDate = b.startDate ? new Date(b.startDate) : new Date();
    if (Number.isNaN(startDate.getTime())) return bad(res, 'Invalid start date');
    let endDate = b.endDate ? new Date(b.endDate) : null;
    if (endDate && Number.isNaN(endDate.getTime())) return bad(res, 'Invalid end date');
    if (endDate && endDate <= startDate) return bad(res, 'The lease must end after it starts');
    let durationMonths = b.durationMonths ? Number(b.durationMonths) : 12;
    if (endDate) {
      durationMonths = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)));
    } else {
      if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 60) {
        return bad(res, 'durationMonths must be a whole number from 1 to 60');
      }
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
    }
    const rentDueDate = b.rentDueDate ? Number(b.rentDueDate) : 5;
    if (!Number.isInteger(rentDueDate) || rentDueDate < 1 || rentDueDate > 28) {
      return bad(res, 'rentDueDate must be a day of the month from 1 to 28');
    }

    // The tenant: reuse their account if they already have one, else create it.
    const byEmail = await User.findOne({ email });
    const byPhone = await User.findOne({ phone });
    if (byEmail && byPhone && String(byEmail._id) !== String(byPhone._id)) {
      return bad(res, 'That email and phone belong to two different accounts', 409);
    }
    let tenant = byEmail || byPhone;
    let initialPassword;
    let activationEmailSent = null;
    if (tenant) {
      const roles = Array.isArray(tenant.roles) && tenant.roles.length ? tenant.roles : [tenant.role];
      if (tenant.role !== 'tenant' || roles.some((r) => r !== 'tenant')) {
        return bad(res, 'That email or phone belongs to an account that is not a tenant', 409);
      }
      if (tenant.status === 'suspended' || tenant.isActive === false) {
        return bad(res, 'That tenant account is not active', 409);
      }
    } else {
      initialPassword = crypto.randomBytes(9).toString('base64url') + '!2b';
      tenant = new User({
        email,
        phone,
        firstName,
        lastName,
        password: initialPassword,
        role: 'tenant',
        roles: ['tenant'],
        emailVerified: false,
        isAdminProvisioned: true,
        requirePasswordChange: true,
        createdBy: req.user._id,
      });
      const rawToken = activation.stampActivation(tenant);
      await tenant.save();
      created.user = tenant;
      activationEmailSent = await activation.sendActivationEmail(tenant, rawToken);
    }

    const startsNow = startDate <= new Date();
    const lease = await Lease.create({
      property: property._id,
      tenant: tenant._id,
      landlord: req.user._id,
      ...(unit ? { unit } : {}),
      startDate,
      endDate,
      terms: { rentAmount, depositAmount, durationMonths, rentDueDate, terminationNotice: 2, currency: 'KES' },
      status: startsNow ? 'active' : 'pending',
    });
    created.lease = lease;

    await occupyUnit({
      propertyId: property._id, unit, tenantId: tenant._id,
      leaseStart: startDate, leaseEnd: endDate, rentDueDate,
    });

    res.status(201).json({
      message: 'Tenant added',
      newAccount: !!created.user,
      activationEmailSent,
      tenant: { id: tenant._id, firstName: tenant.firstName, lastName: tenant.lastName, email: tenant.email, phone: tenant.phone },
      lease: {
        id: lease._id, status: lease.status, unit: lease.unit, startDate: lease.startDate, endDate: lease.endDate,
        rentAmount, depositAmount, rentDueDate,
      },
      // Returned exactly once so the landlord can hand it over; only the hash is stored.
      initialPassword,
    });
  } catch (err) {
    logger.error('Landlord tenant onboarding failed:', err);
    // Do not leave a half-created tenant behind.
    try {
      if (created.lease) await Lease.deleteOne({ _id: created.lease._id });
      if (created.user) await User.deleteOne({ _id: created.user._id });
    } catch (cleanupErr) {
      logger.error('Onboarding cleanup failed:', cleanupErr);
    }
    res.status(500).json({ error: 'Failed to add tenant' });
  }
};
