const { checkUsageLimit } = require('../services/subscription.service');
const { PRICING_ROLES } = require('../config/pricingPlans');

// Blocks the request with 402 Payment Required when the user's subscription
// tier usage limit (units/listings/jobs) has been reached. Must run after
// authenticate() so req.user is populated.
const enforceUsageLimit = () => async (req, res, next) => {
  try {
    const { allowed, used, limit, tier } = await checkUsageLimit(req.user);
    if (!allowed) {
      const usageLabel = PRICING_ROLES[req.user.role]?.usageLabel || 'items';
      return res.status(402).json({
        error: 'Subscription limit reached',
        message: `Your ${tier} plan allows up to ${limit} ${usageLabel}. Upgrade to add more.`,
        usage: { used, limit, tier },
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { enforceUsageLimit };
