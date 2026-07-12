// utils/auth.js
const jwt = require('jsonwebtoken');
const logger = require('./logger');

// JWT Token Generation
const generateToken = ({ id, role, phone }) => { // Destructure the object
  return jwt.sign(
    { 
      userId: id, // Map id to userId
      role,
      phone,
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
  verifyToken,
  validateKenyanPhone, 
  formatToStrictKenyan, 
  generateVerificationCode
};