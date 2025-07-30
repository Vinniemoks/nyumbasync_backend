const { formatCurrency } = require('./formatters');

// Late fee constants for clarity and easy modification
const LATE_FEE_CONFIG = {
  // MAX_MONTHLY_PERCENTAGE: 0.05, // 5% max per month - Not used with new logic
  // DAYS_IN_MONTH: 30, // Not used with new logic
  // GRACE_PERIOD_DAYS: 3, // Optional: no fees for first 3 days - Not used with new logic
  LATE_FEE_PERCENTAGE: 0.10, // 10% fixed late fee
  DUE_DAY_THRESHOLD: 10, // Day of the month payment is due
};

/**
 * Generates M-Pesa compatible reference numbers
 */
exports.generatePaymentReference = (userId) => {
  const timestamp = Date.now().toString().slice(-6);
  return `NYUMBA${timestamp}${userId.toString().slice(-4)}`;
};

/**
 * Calculates prorated rent for Kenya (30-day months)
 */
exports.calculateProratedRent = (dailyRate, daysOccupied) => {
  if (dailyRate <= 0 || daysOccupied <= 0) return 0;
  return Math.ceil(dailyRate * daysOccupied); // Round up to full KES
};

/**
 * Validates M-Pesa callback data
 */
exports.validateMpesaCallback = (callbackData) => {
  if (!callbackData || typeof callbackData !== 'object') return false;
  
  const requiredFields = [
    'BusinessShortCode',
    'TransactionType',
    'Amount',
    'PartyA',
    'TransactionDesc'
  ];
  
  return requiredFields.every(field => 
    callbackData[field] !== undefined && callbackData[field] !== null
  );
};

/**
 * Calculates late fees based on a fixed 10% charge if paid after the 10th
 * 
 * @param {number} rentAmount - Monthly rent amount
 * @param {number} daysLate - Number of days payment is late (relative to due date, e.g., > 0 means after due date)
 * @returns {Object} - Late fee calculation details
 */
exports.calculateLateFees = (rentAmount, daysLate) => {
  // Input validation
  if (!rentAmount || rentAmount <= 0) {
    return { amount: 0, error: 'Invalid rent amount' };
  }
  
  // If payment is on or before the 10th day, no late fee
  if (daysLate <= LATE_FEE_CONFIG.DUE_DAY_THRESHOLD) {
    return {
      amount: 0,
      daysLate,
      chargeableDays: 0,
      gracePeriod: true, // Indicates no late fee was applied
    };
  }

  // If payment is after the 10th day, apply 10% fixed fee
  const lateFee = rentAmount * LATE_FEE_CONFIG.LATE_FEE_PERCENTAGE;

  return {
    amount: Math.round(lateFee), // Round to nearest KES
    daysLate,
    chargeableDays: daysLate - LATE_FEE_CONFIG.DUE_DAY_THRESHOLD, // Days exceeding the threshold
    gracePeriod: false,
    capped: false, // No capping with this logic
  };
};

/**
 * Simple late fee calculator for quick calculations
 * Uses default settings (no grace period, 5% monthly cap)
 */
exports.calculateLateFeeSimple = (rentAmount, daysLate) => {
  const result = exports.calculateLateFees(rentAmount, daysLate);
  return result.amount || 0;
};

/**
 * Calculate total amount due including rent and late fees
 */
exports.calculateTotalDue = (rentAmount, daysLate, options = {}) => {
  const lateFeeResult = exports.calculateLateFees(rentAmount, daysLate, options);
  
  return {
    rentAmount,
    lateFee: lateFeeResult.amount,
    totalDue: rentAmount + lateFeeResult.amount,
    lateFeeDetails: lateFeeResult,
    formatted: {
      rent: formatCurrency(rentAmount),
      lateFee: formatCurrency(lateFeeResult.amount),
      total: formatCurrency(rentAmount + lateFeeResult.amount),
    }
  };
};
