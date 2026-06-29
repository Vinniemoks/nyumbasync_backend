const Subscription = require('../models/subscription.model');
const Property = require('../models/property.model');
const { getTierConfig } = require('../config/pricingPlans');

// Usage count per billable role.
async function getUsageCount(user) {
  switch (user.role) {
    case 'landlord':
      return Property.countDocuments({ landlord: user._id });
    case 'manager':
      return Property.countDocuments({ manager: user._id });
    case 'vendor': {
      const MaintenanceRequest = require('../models/maintenance-request.model');
      return MaintenanceRequest.countDocuments({
        vendorUser: user._id,
        status: { $nin: ['completed', 'closed'] },
      });
    }
    case 'agent':
      // "Active" = still listed (not pulled off-market) — mirrors the
      // landlord unit count, just scoped to listings this agent markets.
      return Property.countDocuments({ agent: user._id, status: { $ne: 'unavailable' } });
    default:
      return 0;
  }
}

async function getOrCreateSubscription(user) {
  return Subscription.findOrCreateForUser(user);
}

// Returns { allowed, used, limit, tier } — limit is null for unlimited tiers.
async function checkUsageLimit(user) {
  const subscription = await getOrCreateSubscription(user);
  const tierConfig = getTierConfig(user.role, subscription.tier);
  const used = await getUsageCount(user);
  const limit = tierConfig ? tierConfig.limit : null;
  const allowed = limit === null || used < limit;
  return { allowed, used, limit, tier: subscription.tier };
}

// Same as checkUsageLimit, but for a user who isn't the requester — e.g. a
// landlord assigning an agent to a listing or a vendor to a maintenance job.
// Loads the target user fresh so it works from just an id.
async function checkUsageLimitForUserId(userId) {
  const User = require('../models/user.model');
  const user = await User.findById(userId);
  if (!user) return { allowed: true, used: 0, limit: null, tier: null };
  return checkUsageLimit(user);
}

module.exports = { getUsageCount, getOrCreateSubscription, checkUsageLimit, checkUsageLimitForUserId };
