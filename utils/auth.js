// utils/auth.js
const jwt = require('jsonwebtoken');
const logger = require('./logger');

// Token issue time with millisecond precision. JWT `iat` is normally whole
// seconds, but revocation (tokenValidAfter, set on password change/reset or
// suspension) is a millisecond cutoff: with whole-second `iat`, a token issued
// right after a password change fell in the same second as the cutoff and was
// rejected as "revoked" (about half of immediate re-logins). A fractional `iat`
// is valid per the JWT spec (NumericDate) and makes "issued after the cutoff"
// exact.
const issuedNow = () => Date.now() / 1000;

// JWT Token Generation
const generateToken = ({ id, role, phone }) => { // Destructure the object
  return jwt.sign(
    { 
      userId: id, // Map id to userId
      role,
      phone,
      iat: issuedNow(),
      iss: 'NyumbaSync API',
      aud: 'nyumbasync.co.ke'
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      algorithm: 'HS256'
    }
  );
};

// Refresh-token generation (assessment C7). Distinct from access tokens: a
// dedicated `type` claim, signed with JWT_REFRESH_SECRET so a refresh token can
// never be used as an access token, and a longer lifetime.
const generateRefreshToken = (id) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign(
    { userId: id, type: 'refresh', iat: issuedNow(), iss: 'NyumbaSync API', aud: 'nyumbasync.co.ke' },
    secret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', algorithm: 'HS256' }
  );
};

const verifyRefreshToken = (token) => {
  try {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'NyumbaSync API',
      audience: 'nyumbasync.co.ke',
    });
    return decoded.type === 'refresh' ? decoded : null;
  } catch (error) {
    return null;
  }
};

// JWT Verification
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'NyumbaSync API',
      audience: 'nyumbasync.co.ke'
    });
  } catch (error) {
    logger.error(`Token verification failed: ${error.message}`);
    return null;
  }
};

/**
 * Kenyan phone validation (accepts all common formats)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid Kenyan mobile number
 */
const validateKenyanPhone = (phone) => {
  if (!phone) return false;
  const cleaned = String(phone).replace(/\D/g, '');
  return /^(254[17]\d{8}|0[17]\d{8}|[17]\d{8})$/.test(cleaned);
};

/**
 * Convert any Kenyan format to strict 254 format
 * @param {string} phone - Raw phone input
 * @returns {string|null} Standardized 254... format or null if invalid
 */
const formatToStrictKenyan = (phone) => {
  if (!phone) return null;
  const cleaned = String(phone).replace(/\D/g, '');

  if (/^254[17]\d{8}$/.test(cleaned)) return cleaned;
  if (/^0[17]\d{8}$/.test(cleaned)) return `254${cleaned.substring(1)}`;
  if (/^[17]\d{8}$/.test(cleaned)) return `254${cleaned}`;

  return null; // Invalid format
};

// M-Pesa Verification Code — cryptographically secure (see utils/secure-random)
const { secureNumericCode } = require('./secure-random');
const generateVerificationCode = () => secureNumericCode(6);

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyToken,
  validateKenyanPhone, 
  formatToStrictKenyan, 
  generateVerificationCode
};