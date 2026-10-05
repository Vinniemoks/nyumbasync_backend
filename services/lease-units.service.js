// Keeps a property's unit (house) occupancy in step with its leases.
const Property = require('../models/property.model');
const logger = require('../utils/logger');

const NO_VALIDATION = { runValidators: false };

/**
 * Mark a unit (or, for a property with no listed houses, the whole property)
 * as taken by `tenantId`. Uses targeted updates so older property documents
 * that would fail full validation are still handled.
 */
async function occupyUnit({ propertyId, unit, tenantId, leaseStart, leaseEnd, rentDueDate }) {
  if (unit) {
    await Property.updateOne(
      { _id: propertyId, 'houses.houseNumber': unit },
      { $set: { 'houses.$.status': 'occupied', 'houses.$.tenant': tenantId } },
      NO_VALIDATION
    );
    const p = await Property.findById(propertyId).select('houses').lean();
    if (p && p.houses.length && p.houses.every((h) => h.status === 'occupied')) {
      await Property.updateOne({ _id: propertyId }, { $set: { status: 'occupied', isAvailable: false } }, NO_VALIDATION);
    }
    return;
  }
  await Property.updateOne(
    { _id: propertyId },
    {
      $set: {
        status: 'occupied',
        isAvailable: false,
        currentTenant: { tenantId, leaseStart, leaseEnd, rentDueDate: rentDueDate || 1 },
      },
    },
    NO_VALIDATION
  );
}

/** Undo occupyUnit for a lease that has ended. Never throws: callers have already saved the lease. */
async function releaseUnit(lease) {
  try {
    const propertyId = lease.property && lease.property._id ? lease.property._id : lease.property;
    if (lease.unit) {
      await Property.updateOne(
        { _id: propertyId, 'houses.houseNumber': lease.unit },
        { $set: { 'houses.$.status': 'available' }, $unset: { 'houses.$.tenant': '' } },
        NO_VALIDATION
      );
      await Property.updateOne({ _id: propertyId }, { $set: { status: 'available', isAvailable: true } }, NO_VALIDATION);
      return;
    }
    await Property.updateOne(
      { _id: propertyId },
      { $set: { status: 'available', isAvailable: true }, $unset: { currentTenant: '' } },
      NO_VALIDATION
    );
  } catch (err) {
    logger.error('Failed to release unit after lease ended:', err);
  }
}

module.exports = { occupyUnit, releaseUnit };
