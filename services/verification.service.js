const crypto = require('crypto');
const emailService = require('./emailService');

// Email verification (signup) and email-OTP login codes. WhatsApp delivery
// plugs in here once WhatsApp Business/Twilio credentials are configured —
// every sender returns false when its channel is unavailable so callers can
// degrade gracefully instead of blocking signup/login.

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

const CLIENT_URL = () => process.env.CLIENT_URL || 'https://nyumbasync.co.ke';
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // links/codes valid for a day
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_OTP_PURPOSE = 'login';

/**
 * Issue an email-verification token + 6-digit code for a user and send the
 * email (confirmation link + code). Returns true if the email went out.
 */
const sendEmailVerification = async (user) => {
  if (!user.email) return false;

  const token = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  user.emailVerifyToken = sha256(token);
  user.emailVerifyCode = sha256(code);
  user.emailVerifyExpiry = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const link = `${CLIENT_URL()}/verify-email?token=${token}`;
  return emailService.sendEmail({
    to: user.email,
    subject: 'Confirm your NyumbaSync account',
    text: `Welcome to NyumbaSync, ${user.firstName || ''}!\n\nConfirm your email by opening this link: ${link}\n\nOr enter this code in the app: ${code}\n\nThe link and code expire in 24 hours.`,
    html: `
      <h2>Welcome to NyumbaSync${user.firstName ? `, ${user.firstName}` : ''}!</h2>
      <p>Confirm your email address to secure your account:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Confirm my email</a></p>
      <p>Or enter this code in the app:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>The link and code expire in 24 hours. If you didn't create a NyumbaSync account, you can ignore this email.</p>`
  });
};

/**
 * Verify by link token or by { email + code }. Marks the account verified.
 * Returns the user on success, null otherwise.
 */
const verifyEmail = async ({ token, email, code }, User) => {
  let user = null;
  if (token) {
    user = await User.findOne({ emailVerifyToken: sha256(token) }).select('+emailVerifyToken +emailVerifyCode');
  } else if (email && code) {
    user = await User.findOne({ email }).select('+emailVerifyToken +emailVerifyCode');
    if (user && (!user.emailVerifyCode || sha256(code) !== user.emailVerifyCode)) user = null;
  }
  if (!user) return null;
  if (!user.emailVerifyExpiry || user.emailVerifyExpiry < new Date()) return null;

  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyCode = undefined;
  user.emailVerifyExpiry = undefined;
  await user.save({ validateBeforeSave: false });
  return user;
};

/**
 * Email a 6-digit login OTP (the email-MFA channel). Returns true if sent.
 */
const sendLoginOtp = async (user) => {
  if (!user.email) return false;
  const code = String(crypto.randomInt(100000, 1000000));
  user.actionOtp = sha256(code);
  user.actionOtpExpiry = new Date(Date.now() + LOGIN_OTP_TTL_MS);
  user.actionOtpPurpose = LOGIN_OTP_PURPOSE;
  await user.save({ validateBeforeSave: false });

  return emailService.sendEmail({
    to: user.email,
    subject: 'Your NyumbaSync login code',
    text: `Your login code is ${code}. It expires in 10 minutes. If this wasn't you, change your password immediately.`,
    html: `<p>Your login code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If this wasn't you, change your password immediately.</p>`
  });
};

/**
 * Check a login OTP for a user document that has +actionOtp selected.
 * Consumes the code on success.
 */
const verifyLoginOtp = async (user, code) => {
  if (!code || !user.actionOtp || user.actionOtpPurpose !== LOGIN_OTP_PURPOSE) return false;
  if (!user.actionOtpExpiry || user.actionOtpExpiry < new Date()) return false;
  if (sha256(code) !== user.actionOtp) return false;

  user.actionOtp = undefined;
  user.actionOtpExpiry = undefined;
  user.actionOtpPurpose = undefined;
  await user.save({ validateBeforeSave: false });
  return true;
};

module.exports = { sendEmailVerification, verifyEmail, sendLoginOtp, verifyLoginOtp };
