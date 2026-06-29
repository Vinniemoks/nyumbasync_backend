const { getOrCreateSubscription, checkUsageLimit } = require('../services/subscription.service');
const { getTierConfig, TIER_IDS, BILLING_CYCLES } = require('../config/pricingPlans');
const mpesaService = require('../services/mpesa.service');

const PERIOD_MS = { monthly: 30 * 24 * 60 * 60 * 1000, annual: 365 * 24 * 60 * 60 * 1000 };

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
        pendingTier: subscription.pendingTier,
        pendingBillingCycle: subscription.pendingBillingCycle,
      },
      usage: { used, limit },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load subscription', message: error.message });
  }
};

// POST /api/v1/subscriptions/upgrade { tier, billingCycle }
// Free-tier changes apply immediately. A paid tier is recorded as pending —
// `tier`/limit stay at the last *paid-for* plan until POST .../upgrade/pay
// is completed and M-Pesa confirms payment, so the higher limit is never
// granted before money has actually moved.
exports.upgradeSubscription = async (req, res) => {
  try {
    const { tier, billingCycle = 'monthly' } = req.body;

    if (!TIER_IDS.includes(tier)) {
      return res.status(400).json({ error: `tier must be one of: ${TIER_IDS.join(', ')}` });
    }
    if (!BILLING_CYCLES.includes(billingCycle)) {
      return res.status(400).json({ error: `billingCycle must be one of: ${BILLING_CYCLES.join(', ')}` });
    }
    const tierConfig = getTierConfig(req.user.role, tier);
    if (!tierConfig) {
      return res.status(400).json({ error: `${tier} is not a valid tier for role ${req.user.role}` });
    }

    const subscription = await getOrCreateSubscription(req.user);

    if (tier === 'free') {
      subscription.tier = 'free';
      subscription.billingCycle = 'monthly';
      subscription.status = 'active';
      subscription.currentPeriodEnd = null;
      subscription.pendingTier = null;
      subscription.pendingBillingCycle = null;
      subscription.pendingPayment = {};
      await subscription.save();
      return res.json({
        success: true,
        subscription: { tier: subscription.tier, billingCycle: subscription.billingCycle, status: subscription.status },
        message: 'Subscription downgraded to Free.',
      });
    }

    subscription.pendingTier = tier;
    subscription.pendingBillingCycle = billingCycle;
    subscription.status = 'pending';
    await subscription.save();

    res.json({
      success: true,
      subscription: {
        tier: subscription.tier,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        pendingTier: subscription.pendingTier,
        pendingBillingCycle: subscription.pendingBillingCycle,
      },
      amountDue: tierConfig[billingCycle],
      message: `Upgrade to ${tier} recorded. Call POST /subscriptions/upgrade/pay to collect payment via M-Pesa.`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subscription', message: error.message });
  }
};

// POST /api/v1/subscriptions/upgrade/pay { phone }
// Initiates an M-Pesa STK push for the pending upgrade's amount.
exports.payForUpgrade = async (req, res) => {
  try {
    const subscription = await getOrCreateSubscription(req.user);
    if (!subscription.pendingTier) {
      return res.status(400).json({ error: 'No pending upgrade. Call POST /subscriptions/upgrade first.' });
    }

    if (!mpesaService.isConfigured()) {
      return res.status(503).json({ error: 'M-Pesa is not configured on the server' });
    }

    const phone = String(req.body.phone || req.user.phone || '');
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      return res.status(400).json({ error: 'A valid Kenyan phone number is required' });
    }

    const tierConfig = getTierConfig(subscription.role, subscription.pendingTier);
    const amount = tierConfig[subscription.pendingBillingCycle];
    // Daraja caps AccountReference at 12 chars.
    const reference = `SUB${subscription._id.toString().slice(-9)}`;

    try {
      const stk = await mpesaService.initiateSTKPush(phone, amount, reference);
      subscription.pendingPayment = {
        checkoutRequestId: stk.CheckoutRequestID,
        amount,
        phone,
        initiatedAt: new Date(),
      };
      await subscription.save();

      return res.status(202).json({
        success: true,
        status: 'pending',
        checkoutRequestId: stk.CheckoutRequestID,
        message: 'STK push sent. Enter your M-Pesa PIN to complete payment.',
      });
    } catch (stkErr) {
      return res.status(502).json({ error: 'Could not reach M-Pesa via STK push.', message: stkErr.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to initiate payment', message: error.message });
  }
};

// Called from payment.controller's shared M-Pesa callback when the
// CheckoutRequestID doesn't match a rent Payment. Returns true if this
// callback belonged to a subscription payment (handled either way),
// false if it's unrecognized so the caller can 404 it.
exports.handleMpesaCallback = async (stk) => {
  const Subscription = require('../models/subscription.model');
  const subscription = await Subscription.findOne({ 'pendingPayment.checkoutRequestId': stk.CheckoutRequestID });
  if (!subscription) return false;

  // Ignore duplicate callbacks for an already-applied upgrade.
  if (subscription.status === 'active' && !subscription.pendingPayment?.checkoutRequestId) {
    return true;
  }

  if (stk.ResultCode === 0) {
    subscription.tier = subscription.pendingTier;
    subscription.billingCycle = subscription.pendingBillingCycle;
    subscription.status = 'active';
    subscription.currentPeriodEnd = new Date(Date.now() + (PERIOD_MS[subscription.billingCycle] || PERIOD_MS.monthly));
    subscription.pendingTier = null;
    subscription.pendingBillingCycle = null;
    subscription.pendingPayment = {};
  } else {
    // Payment failed/cancelled — stay pending, but clear the checkout id so
    // the user can retry with a fresh STK push.
    subscription.pendingPayment = {};
  }
  await subscription.save();
  return true;
};
