// utils/auth.js
const jwt = require('jsonwebtoken');
const logger = require('./logger');

// JWT Token Generation
const generateToken = (userId, role, phone) => {
  return jwt.sign(
    { 
      userId, 
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
 * Strict Kenyan phone validation (254 prefix only)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid Kenyan number in 254 format
 */
const validateKenyanPhone = (phone) => {
  return /^254[17]\d{8}$/.test(phone);
};

/**
 * Convert any Kenyan format to strict 254 format
 * @param {string} phone - Raw phone input
 * @returns {string|null} Standardized 254... format or null if invalid
 */
const formatToStrictKenyan = (phone) => {
  // First check if already in correct format
  if (/^254[17]\d{8}$/.test(phone)) return phone;
  
  // Convert from other Kenyan formats
  const cleaned = phone.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(cleaned)) return `254${cleaned.substring(1)}`;
  if (/^[17]\d{8}$/.test(cleaned)) return `254${cleaned}`;
  
  return null; // Invalid format
};

// M-Pesa Verification Code
const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

module.exports = {
  generateToken,
  verifyToken,
  validateKenyanPhone, // Your strict validator
  formatToStrictKenyan, // Format converter
  generateVerificationCode
};