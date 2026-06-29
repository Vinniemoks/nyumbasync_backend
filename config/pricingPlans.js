// Subscription pricing model — decided 2026-06-29. Mirrors
// nyumbasynctest/src/config/pricingPlans.js; keep both in sync if the model
// changes. Landlords, Property Managers, Agents, and Vendors are billed;
// Tenants are always free (invited by a paying account, never charged).
// Every tier gets the full feature set — the only gate is the usage count.

const PRICING_ROLES = {
  landlord: {
    usageLabel: 'units',
    tiers: {
      free: { limit: 3, monthly: 0, annual: 0 },
      starter: { limit: 25, monthly: 1500, annual: 15000 },
      growth: { limit: 100, monthly: 5000, annual: 50000 },
      enterprise: { limit: null, monthly: null, annual: null },
    },
  },
  manager: {
    // Managers share the landlord tier ladder — they manage units on behalf
    // of a landlord rather than owning a separate usage metric.
    usageLabel: 'units',
    tiers: {
      free: { limit: 3, monthly: 0, annual: 0 },
      starter: { limit: 25, monthly: 1500, annual: 15000 },
      growth: { limit: 100, monthly: 5000, annual: 50000 },
      enterprise: { limit: null, monthly: null, annual: null },
    },
  },
  agent: {
    usageLabel: 'active listings',
    tiers: {
      free: { limit: 5, monthly: 0, annual: 0 },
      starter: { limit: 30, monthly: 1000, annual: 10000 },
      growth: { limit: 150, monthly: 3500, annual: 35000 },
      enterprise: { limit: null, monthly: null, annual: null },
    },
  },
  vendor: {
    usageLabel: 'active jobs',
    tiers: {
      free: { limit: 5, monthly: 0, annual: 0 },
      starter: { limit: 30, monthly: 800, annual: 8000 },
      growth: { limit: 150, monthly: 3000, annual: 30000 },
      enterprise: { limit: null, monthly: null, annual: null },
    },
  },
};

const BILLABLE_ROLES = Object.keys(PRICING_ROLES);
const TIER_IDS = ['free', 'starter', 'growth', 'enterprise'];
const BILLING_CYCLES = ['monthly', 'annual'];

function getTierConfig(role, tier) {
  const roleConfig = PRICING_ROLES[role];
  if (!roleConfig) return null;
  return roleConfig.tiers[tier] || null;
}

module.exports = { PRICING_ROLES, BILLABLE_ROLES, TIER_IDS, BILLING_CYCLES, getTierConfig };
