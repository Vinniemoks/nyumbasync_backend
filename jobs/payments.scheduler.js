const Payment = require('../models/payment.model');
const logger = require('../utils/logger');

// Expire time-boxed payment intents (Paybill fallback ~10min, bank ~48h) whose
// window has passed. Clearing `accountRef` "removes the credentials from the
// system" so a late M-Pesa payment to that number no longer matches an intent
// (the C2B confirmation handler then auto-reverses it).
const expireStaleIntents = async (now = new Date()) => {
  const result = await Payment.updateMany(
    {
      channel: { $in: ['C2B_PAYBILL', 'BANK'] },
      status: 'pending',
      expiresAt: { $lt: now }
    },
    {
      $set: { status: 'expired' },
      $unset: { accountRef: '' }
    }
  );
  const n = result.modifiedCount ?? result.nModified ?? 0;
  if (n > 0) logger.info(`Payment intents expired: ${n}`);
  return { expired: n };
};

// Register the expiry cron. Disabled when ENABLE_SCHEDULER=false or node-cron
// is unavailable. Safe to call once at boot.
const start = () => {
  if (process.env.ENABLE_SCHEDULER === 'false') {
    logger.info('Payments scheduler disabled (ENABLE_SCHEDULER=false)');
    return;
  }

  let cron;
  try {
    cron = require('node-cron');
  } catch (err) {
    logger.warn('node-cron not installed — payments scheduler not started');
    return;
  }

  // Every minute — expiry must be timely (the fallback window is ~10 min).
  cron.schedule('* * * * *', () => {
    expireStaleIntents().catch(err => logger.error('Payment expiry job failed:', err));
  });

  logger.info('Payments scheduler started (intent expiry)');
};

module.exports = { start, expireStaleIntents };
