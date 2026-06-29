const { getOrCreateSubscription, checkUsageLimit } = require('../services/subscription.service');
const { getTierConfig, TIER_IDS, BILLING_CYCLES } = require('../config/pricingPlans');

// GET /api/v1/subscriptions/me
exports.getMySubscription = async (req, res) => {
  try {
    const subscription = await getOrCreateSubscription(req.user);
    const { used, limit } = await checkUsageLimit(req.user);
    res.json({
      success: true,
      subscription: {
        tier: subscription.tier,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      usage: { used, limit },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load subscription', message: error.message });
  }
};

// POST /api/v1/subscriptions/upgrade { tier, billingCycle }
// NOTE: no payment gateway is wired in yet. Free-tier changes apply
// immediately; paid-tier requests are recorded as 'pending' until billing
// (M-Pesa recurring or similar) is built — they do not unlock the higher
// limit on their own.
exports.upgradeSubscription = async (req, res) => {
  try {
    const { tier, billingCycle } = req.body;

    if (!TIER_IDS.includes(tier)) {
      return res.status(400).json({ error: `tier must be one of: ${TIER_IDS.join(', ')}` });
    }
    if (billingCycle && !BILLING_CYCLES.includes(billingCycle)) {
      return res.status(400).json({ error: `billingCycle must be one of: ${BILLING_CYCLES.join(', ')}` });
    }
    if (!getTierConfig(req.user.role, tier)) {
      return res.status(400).json({ error: `${tier} is not a valid tier for role ${req.user.role}` });
    }

    const subscription = await getOrCreateSubscription(req.user);
    subscription.tier = tier;
    if (billingCycle) subscription.billingCycle = billingCycle;
    subscription.status = tier === 'free' ? 'active' : 'pending';
    await subscription.save();

    res.json({
      success: true,
      subscription: {
        tier: subscription.tier,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
      },
      message: subscription.status === 'pending'
        ? 'Upgrade recorded. Payment collection is not yet wired in — contact support to complete this upgrade.'
        : 'Subscription updated.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subscription', message: error.message });
  }
};
