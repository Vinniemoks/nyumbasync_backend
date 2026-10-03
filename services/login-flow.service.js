// The steps that happen *after* a user has proved who they are (password, MFA
// code, or a verified OAuth identity) and *before* a session is issued. Every
// way of finishing a login goes through here so the same gates always apply:
//
//   1. account must not be suspended / inactive
//   2. admin-provisioned accounts must set their own password first
//   3. admin / super_admin sign-ins from an unfamiliar IP need an emailed code
//
// Previously these lived inline in the password-login handler only, so a user
// finishing through MFA (or Google/Apple) skipped them entirely.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { secureNumericCode } = require('../utils/secure-random');
const { generateToken, generateRefreshToken } = require('../utils/auth');
const { PURPOSES, accountBlockReason, BLOCK_MESSAGES } = require('../utils/token-scope');
const logger = require('../utils/logger');
const emailService = require('./emailService');
const LoginAudit = require('../models/login-audit.model');

const ADMIN_LEVEL_ROLES = [
  'admin', 'super_admin', 'support_admin', 'finance_admin',
  'operations_admin', 'sales_customer_service_admin', 'viewer',
];
// Roles whose sign-in from a new IP must be confirmed by an emailed code.
const IP_GATED_ROLES = ['admin', 'super_admin'];

// Roles anyone may pick for themselves when signing up (same as /auth/signup).
const SELF_REGISTRABLE_ROLES = ['tenant', 'landlord', 'agent', 'vendor'];

const IP_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_IP_CODE_ATTEMPTS = 5;
const PASSWORD_CHANGE_TOKEN_TTL = '10m';
const MAX_KNOWN_IPS = 20;
const MAX_LOGIN_IPS = 10;

const rolesOf = (user) =>
  (Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role]).filter(Boolean);
const hasAnyRole = (user, list) => rolesOf(user).some((r) => list.includes(r));

const isAdminLevel = (user) => hasAnyRole(user, ADMIN_LEVEL_ROLES);
const isIpGated = (user) => hasAnyRole(user, IP_GATED_ROLES);

const clientIp = (req) => req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress;

/** Fire-and-forget audit entry; auditing must never break a login. */
function audit(req, fields) {
  try {
    LoginAudit.create({
      ip: clientIp(req),
      userAgent: req.get ? req.get('user-agent') : undefined,
      ...fields,
    }).catch(() => {});
  } catch (_) { /* ignore */ }
}

const auditFields = (user, reason, success = true, extra = {}) => ({
  user: user._id,
  email: user.email,
  role: user.role,
  identifier: user.email ? String(user.email).toLowerCase() : undefined,
  success,
  reason,
  ...extra,
});

/** 403 body for a locked account, or null when the account may sign in. */
function blockedResponse(user) {
  const reason = accountBlockReason(user);
  if (!reason) return null;
  return {
    reason,
    body: { error: BLOCK_MESSAGES[reason], code: `ACCOUNT_${reason.toUpperCase()}` },
  };
}

const isKnownIp = (user, ip) => Array.isArray(user.knownIps) && user.knownIps.some((e) => e.ip === ip);

/**
 * Remember this IP on the account (last 20 known, last 10 sign-ins). Mutates
 * the document; the caller saves.
 */
function recordLoginIp(user, ip) {
  if (!ip) return;
  if (!user.knownIps) user.knownIps = [];
  const known = user.knownIps.find((e) => e.ip === ip);
  if (known) {
    known.lastSeen = new Date();
  } else {
    user.knownIps.push({ ip, firstSeen: new Date(), lastSeen: new Date() });
    if (user.knownIps.length > MAX_KNOWN_IPS) user.knownIps = user.knownIps.slice(-MAX_KNOWN_IPS);
  }
  if (!user.loginIps) user.loginIps = [];
  user.loginIps.push(ip);
  if (user.loginIps.length > MAX_LOGIN_IPS) user.loginIps = user.loginIps.slice(-MAX_LOGIN_IPS);
}

/**
 * Run the gates. Returns null when the user may be signed in, otherwise
 * { type, body } where `body` is the JSON to send (HTTP 200) so the client can
 * collect what's missing and try again.
 */
async function evaluateGates(user, req) {
  if (user.requirePasswordChange) {
    const token = jwt.sign(
      { userId: user._id, purpose: PURPOSES.PASSWORD_CHANGE },
      process.env.JWT_SECRET,
      { expiresIn: PASSWORD_CHANGE_TOKEN_TTL, algorithm: 'HS256' }
    );
    logger.info(`Password change required for user ${user._id}`);
    audit(req, auditFields(user, 'require_password_change'));
    return {
      type: 'password-change',
      body: {
        requirePasswordChange: true,
        message: 'You must change your password before continuing',
        token,
      },
    };
  }

  const ip = clientIp(req);
  if (isIpGated(user) && !isKnownIp(user, ip)) {
    const code = secureNumericCode(6);
    user.ipVerificationCode = crypto.createHash('sha256').update(code).digest('hex');
    user.ipVerificationCodeExpiry = Date.now() + IP_CODE_TTL_MS;
    user.ipVerificationAttempts = 0;
    await user.save();

    let emailSent = false;
    try {
      emailSent = await emailService.sendEmail({
        to: user.email,
        subject: 'NyumbaSync - New Login Verification Code',
        html: `<p>Hello ${user.firstName},</p><p>A login was attempted from a new IP address: <strong>${ip}</strong>.</p><p>Your verification code is: <strong>${code}</strong></p><p>This code will expire in 5 minutes.</p><p>If you did not attempt this login, please contact support immediately.</p>`,
      });
    } catch (err) {
      logger.error('Failed to send IP verification email:', err);
    }

    const ipSessionToken = jwt.sign(
      { userId: user._id, expectedIp: ip, purpose: PURPOSES.IP_VERIFICATION },
      process.env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    logger.info(`IP verification required for admin user ${user._id} from ${ip}`);
    audit(req, auditFields(user, 'require_ip_verification'));
    return {
      type: 'ip-verification',
      body: {
        requireIpVerification: true,
        ipSessionToken,
        emailSent,
        message: 'A verification code has been sent to your email',
      },
    };
  }

  return null;
}

/**
 * Check the emailed new-IP code. At most MAX_IP_CODE_ATTEMPTS wrong guesses are
 * allowed per code (a 6-digit code is otherwise brute-forceable within its
 * five-minute life); comparison is constant-time. Mutates and saves the user.
 * @returns {Promise<{ok:true}|{ok:false,status:number,error:string}>}
 */
async function checkIpCode(user, code) {
  if (!user.ipVerificationCode || !user.ipVerificationCodeExpiry || user.ipVerificationCodeExpiry < Date.now()) {
    return { ok: false, status: 400, error: 'Verification code expired' };
  }
  if ((user.ipVerificationAttempts || 0) >= MAX_IP_CODE_ATTEMPTS) {
    user.ipVerificationCode = undefined;
    user.ipVerificationCodeExpiry = undefined;
    user.ipVerificationAttempts = 0;
    await user.save();
    return { ok: false, status: 429, error: 'Too many incorrect codes. Please sign in again to get a new one.' };
  }

  const given = crypto.createHash('sha256').update(String(code).trim()).digest();
  const stored = Buffer.from(String(user.ipVerificationCode), 'hex');
  const match = stored.length === given.length && crypto.timingSafeEqual(stored, given);

  if (!match) {
    user.ipVerificationAttempts = (user.ipVerificationAttempts || 0) + 1;
    const exhausted = user.ipVerificationAttempts >= MAX_IP_CODE_ATTEMPTS;
    if (exhausted) {
      user.ipVerificationCode = undefined;
      user.ipVerificationCodeExpiry = undefined;
      user.ipVerificationAttempts = 0;
    }
    await user.save();
    return exhausted
      ? { ok: false, status: 429, error: 'Too many incorrect codes. Please sign in again to get a new one.' }
      : { ok: false, status: 400, error: 'Invalid verification code' };
  }

  user.ipVerificationCode = undefined;
  user.ipVerificationCodeExpiry = undefined;
  user.ipVerificationAttempts = 0;
  return { ok: true };
}

/** Record the sign-in and mint the session tokens. Saves the user. */
async function completeLogin(user, ip) {
  recordLoginIp(user, ip);
  user.lastLogin = Date.now();
  await user.save();
  return {
    token: generateToken({ id: user._id, email: user.email, phone: user.phone, role: user.role }),
    refreshToken: generateRefreshToken(user._id),
  };
}

/**
 * Roles a brand-new OAuth account may start with: the requested role(s) if they
 * are self-registrable, otherwise tenant. Never an admin role.
 */
function oauthSignupRoles(requested) {
  const list = (Array.isArray(requested) ? requested : [requested]).filter(Boolean);
  const safe = [...new Set(list.filter((r) => SELF_REGISTRABLE_ROLES.includes(r)))];
  return safe.length ? safe : ['tenant'];
}

/** Staff accounts must use password + MFA + new-IP checks, never OAuth. */
const STAFF_OAUTH_BODY = {
  error: 'Staff accounts must sign in with their email or phone, password and verification code.',
  code: 'OAUTH_NOT_ALLOWED_FOR_STAFF',
};

const sessionUser = (user) => ({
  id: user._id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
  role: user.role,
  roles: user.roles,
  phone: user.phone,
  accountNumber: user.accountNumber,
  mfaEnabled: user.mfaEnabled || false,
  emailVerified: user.emailVerified || false,
});

module.exports = {
  ADMIN_LEVEL_ROLES,
  IP_GATED_ROLES,
  MAX_IP_CODE_ATTEMPTS,
  SELF_REGISTRABLE_ROLES,
  STAFF_OAUTH_BODY,
  oauthSignupRoles,
  isAdminLevel,
  isIpGated,
  clientIp,
  audit,
  auditFields,
  blockedResponse,
  recordLoginIp,
  evaluateGates,
  checkIpCode,
  completeLogin,
  sessionUser,
};
