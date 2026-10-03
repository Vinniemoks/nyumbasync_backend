// Account activation for admin-provisioned users: a single-use, 24-hour link
// emailed to the address the admin entered, proving the person controls it.
// Only the sha256 of the token is stored; resending replaces (and so
// invalidates) the previous link.

const crypto = require('crypto');
const logger = require('../utils/logger');
const templatedEmail = require('./email.service');

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const frontendUrl = () => process.env.FRONTEND_URL || 'https://nyumbasync.co.ke';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/** Waiting for the person to confirm their email? */
const isPending = (user) => !!(user && user.isAdminProvisioned && !user.emailVerified);

/** Seconds until another activation email may be sent, or 0. */
const cooldownSeconds = (user, now = Date.now()) => {
  if (!user.activationSentAt) return 0;
  const left = new Date(user.activationSentAt).getTime() + RESEND_COOLDOWN_MS - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
};

/**
 * Put a fresh activation token on the user (the caller saves) and return the
 * raw token for the email link.
 */
function stampActivation(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.activationToken = sha256(token);
  user.activationExpires = Date.now() + ACTIVATION_TTL_MS;
  user.activationSentAt = new Date();
  return token;
}

/** Email the activation link. Resolves true only if the provider accepted it. */
async function sendActivationEmail(user, rawToken) {
  const activationUrl = `${frontendUrl()}/activate?token=${rawToken}`;
  try {
    const result = await templatedEmail.sendEmail(
      user.email,
      'Activate Your NyumbaSync Account - NyumbaSync',
      'account-activation',
      {
        name: user.firstName || 'User',
        activationUrl,
        appUrl: frontendUrl(),
        year: new Date().getFullYear(),
      }
    );
    return result === true || !!(result && result.success === true);
  } catch (err) {
    logger.error('Failed to send activation email:', err);
    return false;
  }
}

/**
 * Issue a new link for a pending account and email it. Saves the user.
 * @returns {Promise<{sent:boolean}>}
 */
async function issueAndSend(user) {
  const rawToken = stampActivation(user);
  await user.save({ validateBeforeSave: false });
  return { sent: await sendActivationEmail(user, rawToken) };
}

module.exports = {
  ACTIVATION_TTL_MS,
  RESEND_COOLDOWN_MS,
  isPending,
  cooldownSeconds,
  stampActivation,
  sendActivationEmail,
  issueAndSend,
};
