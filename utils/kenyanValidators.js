// Kenyan Validation Patterns
const PATTERNS = {
  KRA_PIN: /^[A-Z]\d{9}[A-Z]$/,
  PHONE: {
    INTERNATIONAL: /^254\d{9}$/,
    LOCAL_MOBILE: /^07\d{8}$/,
    LOCAL_LANDLINE_01: /^01\d{8}$/,
    LOCAL_LANDLINE_02: /^02\d{8}$/,
  },
  NATIONAL_ID: /^\d{8}$/,
  LEASE_DURATION: /^\d+(months|years)$/,
  POSTAL_CODE: /^\d{5}$/,
};

// Kenyan-specific constants
const KENYA_BOUNDS = {
  LAT: { MIN: -4.7, MAX: 5.0 },
  LNG: { MIN: 33.9, MAX: 41.9 },
};

const MPESA_LIMITS = {
  MIN: 10,
  MAX: 150000,
};

const RENT_INCREASE_LIMIT = 0.07; // 7% max annual increase

/**
 * Utilities for data cleaning and processing
 */
const utils = {
  /**
   * Remove all non-digit characters from a string
   */
  cleanPhone: (phone) => phone.replace(/\D/g, ''),
  
  /**
   * Calculate National ID checksum
   */
  calculateChecksum: (digits) => {
    let sum = 0;
    digits.forEach((digit, index) => {
      sum += digit * (digits.length + 1 - index);
    });
    return (sum % 11) % 10;
  },
};

/**
 * Kenyan business validation utilities
 */
module.exports = {
  /**
   * Validates Kenyan phone numbers
   * Supports: 254XXXXXXXXX, 07XXXXXXXX, 01XXXXXXXX, 02XXXXXXXX
   * @param {string} phone - Phone number to validate
   * @returns {boolean} - True if valid format
   */
  validatePhone: (phone) => {
    if (!phone) return false;
    
    const cleanPhone = utils.cleanPhone(phone);
    
    return (
      PATTERNS.PHONE.INTERNATIONAL.test(cleanPhone) ||
      PATTERNS.PHONE.LOCAL_MOBILE.test(cleanPhone) ||
      PATTERNS.PHONE.LOCAL_LANDLINE_01.test(cleanPhone) ||
      PATTERNS.PHONE.LOCAL_LANDLINE_02.test(cleanPhone)
    );
  },

  /**
   * Validates Kenyan National ID with checksum verification
   * @param {string} id - 8-digit National ID
   * @returns {boolean} - True if valid ID with correct checksum
   */
  validateNationalID: (id) => {
    if (!id || !PATTERNS.NATIONAL_ID.test(id)) {
      return false;
    }
    
    const digits = id.split('').map(Number);
    const providedChecksum = digits.pop();
    const calculatedChecksum = utils.calculateChecksum(digits);
    
    return calculatedChecksum === providedChecksum;
  },

  /**
   * Validates rent increase according to Kenyan law (max 7% annually)
   * @param {number} oldRent - Previous rent amount
   * @param {number} newRent - Proposed new rent amount
   * @returns {boolean} - True if increase is within legal limits
   */
  validateRentIncrease: (oldRent, newRent) => {
    if (oldRent <= 0 || newRent <= 0) return false;
    
    const maxAllowedRent = oldRent * (1 + RENT_INCREASE_LIMIT);
    return newRent <= maxAllowedRent;
  },

  /**
   * Validates KRA PIN format (Letter + 9 digits + Letter)
   * @param {string} pin - KRA PIN to validate
   * @returns {boolean} - True if valid format
   */
  validateKRAPin: (pin) => {
    if (!pin) return false;
    return PATTERNS.KRA_PIN.test(pin.toUpperCase());
  },

  /**
   * Validates lease duration format (e.g., "12months", "2years")
   * @param {string} duration - Lease duration string
   * @returns {boolean} - True if valid format
   */
  validateLeaseDuration: (duration) => {
    if (!duration) return false;
    return PATTERNS.LEASE_DURATION.test(duration.toLowerCase());
  },

  /**
   * Validates M-Pesa transaction amounts (10 - 150,000 KES)
   * @param {number} amount - Transaction amount in KES
   * @returns {boolean} - True if within M-Pesa limits
   */
  validateMpesaAmount: (amount) => {
    return (
      typeof amount === 'number' &&
      amount >= MPESA_LIMITS.MIN &&
      amount <= MPESA_LIMITS.MAX
    );
  },

  /**
   * Validates coordinates within Kenya's geographical bounds
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean} - True if coordinates are within Kenya
   */
  validateCoordinates: (lat, lng) => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= KENYA_BOUNDS.LAT.MIN &&
      lat <= KENYA_BOUNDS.LAT.MAX &&
      lng >= KENYA_BOUNDS.LNG.MIN &&
      lng <= KENYA_BOUNDS.LNG.MAX
    );
  },

  /**
   * Validates Kenyan postal code (5 digits)
   * @param {string} code - Postal code to validate
   * @returns {boolean} - True if valid 5-digit postal code
   */
  validatePostalCode: (code) => {
    if (!code) return false;
    return PATTERNS.POSTAL_CODE.test(code);
  },
};