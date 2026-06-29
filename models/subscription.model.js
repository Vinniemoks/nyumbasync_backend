const mongoose = require('mongoose');
const { Schema } = mongoose;
const { BILLABLE_ROLES, TIER_IDS, BILLING_CYCLES } = require('../config/pricingPlans');

// One subscription per billable user (landlord, manager, agent, vendor).
// Tenants never get a subscription — they're invited by a paying account.
const subscriptionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  role: {
    type: String,
    enum: BILLABLE_ROLES,
    required: true,
  },
  tier: {
    type: String,
    enum: TIER_IDS,
    default: 'free',
  },
  billingCycle: {
    type: String,
    enum: BILLING_CYCLES,
    default: 'monthly',
  },
  status: {
    // 'active' covers the free tier too (nothing to collect). 'pending'
    // means an upgrade was requested but payment hasn't settled yet —
    // there is no payment gateway wired in yet, so paid tiers currently
    // land here until that's built.
    type: String,
    enum: ['active', 'pending', 'past_due', 'canceled'],
    default: 'active',
  },
  currentPeriodEnd: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

subscriptionSchema.statics.findOrCreateForUser = async function (user) {
  const existing = await this.findOne({ user: user._id });
  if (existing) return existing;
  return this.create({ user: user._id, role: user.role, tier: 'free', status: 'active' });
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
