const crypto = require('crypto');
const emailService = require('./emailService');
const whatsappService = require('../src/services/whatsappService');

// Email verification (signup) and email/WhatsApp-OTP login codes. Each
// sender returns false when its channel is unavailable so callers can degrade
// gracefully instead of blocking signup/login.

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

const CLIENT_URL = () => process.env.CLIENT_URL || 'https://nyumbasync.co.ke';
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // links/codes valid for a day
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_OTP_PURPOSE = 'login';
const STEP_UP_OTP_TTL_MS = 10 * 60 * 1000;
const STEP_UP_OTP_PURPOSE = 'step-up';

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
  const html = emailService.getEmailVerificationTemplate({
    userName: user.firstName,
    userEmail: user.email,
    verifyUrl: link,
    code
  });
  return emailService.sendEmail({
    from: 'support@nyumbasync.co.ke',
    to: user.email,
    subject: 'Confirm your NyumbaSync account',
    text: `Welcome to NyumbaSync, ${user.firstName || ''}!\n\nConfirm your email by opening this link: ${link}\n\nOr enter this code in the app: ${code}\n\nThe link and code expire in 24 hours. If you didn't create a NyumbaSync account, you can ignore this email.\n\nFrom the NyumbaSync team`,
    html
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
 * Generate and deliver an 8-digit login OTP to the user's email and WhatsApp.
 * Returns the delivery status per channel so callers can report what was sent.
 */
const sendLoginOtp = async (user) => {
  const code = String(crypto.randomInt(10000000, 100000000));
  user.actionOtp = sha256(code);
  user.actionOtpExpiry = new Date(Date.now() + LOGIN_OTP_TTL_MS);
  user.actionOtpPurpose = LOGIN_OTP_PURPOSE;
  await user.save({ validateBeforeSave: false });

  const emailPromise = user.email
    ? emailService.sendEmail({
        from: 'support@nyumbasync.co.ke',
        to: user.email,
        subject: 'Your NyumbaSync login code',
        text: `Your login code is ${code}. It expires in 10 minutes. If this wasn't you, change your password immediately.`,
        html: `<p>Your login code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If this wasn't you, change your password immediately.</p>`
      }).then(() => true).catch(() => false)
    : Promise.resolve(false);

  // WhatsApp delivery uses the pre-approved login-code template when possible,
  // falling back to a best-effort text message if the template is unavailable.
  const whatsappPromise = user.phone
    ? (async () => {
        try {
          const result = await whatsappService.sendTemplatedMessage({
            templateName: 'nyumbasync_login_code',
            to: user.phone,
            language: 'en',
            variables: [user.firstName || 'User', code, '10'],
            tags: ['login_otp'],
            priority: 'high'
          });
          return result.success === true;
        } catch (templateErr) {
          try {
            const text = `Hello ${user.firstName || 'User'}, your NyumbaSync login code is ${code}. It expires in 10 minutes. If you did not request this, change your password immediately.`;
            const result = await whatsappService.sendAutoReply(user.phone, text);
            return result && result.success === true;
          } catch (textErr) {
            return false;
          }
        }
      })()
    : Promise.resolve(false);

  const [emailSent, whatsappSent] = await Promise.all([emailPromise, whatsappPromise]);

  return { emailSent, whatsappSent };
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

/**
 * Generate and deliver an 8-digit step-up OTP to the user's email.
 * Returns true if the email was sent.
 */
const sendStepUpOtp = async (user) => {
  const code = String(crypto.randomInt(10000000, 100000000));
  user.actionOtp = sha256(code);
  user.actionOtpExpiry = new Date(Date.now() + STEP_UP_OTP_TTL_MS);
  user.actionOtpPurpose = STEP_UP_OTP_PURPOSE;
  await user.save({ validateBeforeSave: false });

  if (!user.email) return false;

  try {
    await emailService.sendEmail({
      from: 'support@nyumbasync.co.ke',
      to: user.email,
      subject: 'Your NyumbaSync verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes. If this wasn't you, change your password immediately.`,
      html: `<p>Your verification code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If this wasn't you, change your password immediately.</p>`
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Check a step-up OTP for a user document that has +actionOtp selected.
 * Consumes the code on success.
 */
const verifyStepUpOtp = async (user, code) => {
  if (!code || !user.actionOtp || user.actionOtpPurpose !== STEP_UP_OTP_PURPOSE) return false;
  if (!user.actionOtpExpiry || user.actionOtpExpiry < new Date()) return false;
  if (sha256(code) !== user.actionOtp) return false;

  user.actionOtp = undefined;
  user.actionOtpExpiry = undefined;
  user.actionOtpPurpose = undefined;
  await user.save({ validateBeforeSave: false });
  return true;
};

module.exports = { sendEmailVerification, verifyEmail, sendLoginOtp, verifyLoginOtp, sendStepUpOtp, verifyStepUpOtp };
