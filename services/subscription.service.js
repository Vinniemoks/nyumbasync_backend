const Subscription = require('../models/subscription.model');
const Property = require('../models/property.model');
const { getTierConfig } = require('../config/pricingPlans');

// Usage count per billable role. Agent listing-count is not wired yet —
// Property has no direct `agent` reference (agents link to a property via
// relatedContacts -> Contact, not a User ref), so it returns 0 (unenforced)
// until that relationship is modeled directly. Landlord/manager and vendor
// counts are real.
async function getUsageCount(user) {
  switch (user.role) {
    case 'landlord':
      return Property.countDocuments({ landlord: user._id });
    case 'manager':
      return Property.countDocuments({ manager: user._id });
    case 'vendor': {
      const MaintenanceRequest = require('../models/maintenance-request.model');
      return MaintenanceRequest.countDocuments({
        assignedTo: user._id,
        status: { $nin: ['completed', 'closed'] },
      });
    }
    case 'agent':
      // TODO: wire once Property has a direct agent reference.
      return 0;
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

module.exports = { getUsageCount, getOrCreateSubscription, checkUsageLimit };
