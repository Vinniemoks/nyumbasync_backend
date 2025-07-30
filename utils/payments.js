const { formatCurrency } = require('./formatters');

// Late fee constants for clarity and easy modification
const LATE_FEE_CONFIG = {
  MAX_MONTHLY_PERCENTAGE: 0.05, // 5% max per month
  DAYS_IN_MONTH: 30,
  GRACE_PERIOD_DAYS: 3, // Optional: no fees for first 3 days
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
 * Calculates late fees according to Kenyan rental law
 * Maximum 5% of rent amount per month, prorated daily
 * 
 * @param {number} rentAmount - Monthly rent amount
 * @param {number} daysLate - Number of days payment is late
 * @param {Object} options - Optional configuration
 * @param {number} options.gracePeriod - Days before late fees start (default: 0)
 * @param {number} options.maxMonthlyRate - Max monthly late fee rate (default: 0.05)
 * @returns {Object} - Late fee calculation details
 */
exports.calculateLateFees = (rentAmount, daysLate, options = {}) => {
  // Input validation
  if (!rentAmount || rentAmount <= 0) {
    return { amount: 0, error: 'Invalid rent amount' };
  }
  
  if (!daysLate || daysLate <= 0) {
    return { amount: 0, daysLate: 0, gracePeriod: true };
  }
  
  // Configuration with defaults
  const config = {
    gracePeriod: options.gracePeriod || 0,
    maxMonthlyRate: options.maxMonthlyRate || LATE_FEE_CONFIG.MAX_MONTHLY_PERCENTAGE,
    daysInMonth: LATE_FEE_CONFIG.DAYS_IN_MONTH,
  };
  
  // Apply grace period
  const chargeableDays = Math.max(0, daysLate - config.gracePeriod);
  
  if (chargeableDays <= 0) {
    return { 
      amount: 0, 
      daysLate, 
      chargeableDays: 0, 
      gracePeriod: true 
    };
  }
  
  // Calculate daily rate based on monthly cap
  const maxMonthlyFee = rentAmount * config.maxMonthlyRate;
  const dailyRate = maxMonthlyFee / config.daysInMonth;
  
  // Calculate total fee with monthly cap
  const calculatedFee = dailyRate * chargeableDays;
  const cappedFee = Math.min(calculatedFee, maxMonthlyFee);
  
  return {
    amount: Math.round(cappedFee), // Round to nearest KES
    daysLate,
    chargeableDays,
    dailyRate: Math.round(dailyRate * 100) / 100, // Round to 2 decimal places
    maxMonthlyFee,
    gracePeriod: false,
    capped: calculatedFee > maxMonthlyFee,
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
