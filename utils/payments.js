const { formatCurrency } = require('./formatters');

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
  return Math.ceil(dailyRate * daysOccupied); // Round up to full KES
};

/**
 * Validates M-Pesa callback data
 */
exports.validateMpesaCallback = (callbackData) => {
  const requiredFields = [
    'BusinessShortCode',
    'TransactionType',
    'Amount',
    'PartyA',
    'TransactionDesc'
  ];
  
  return requiredFields.every(field => callbackData[field]);
};

/**
 * Kenyan late fee calculator (max 5% per month)
 */
exports.calculateLateFees = (rentAmount, daysLate) => {
  const dailyPenalty = rentAmount * 0.0005; // 0.05% per day
  const monthlyCap = rentAmount * 0.05; // 5% per month cap
  const totalDailyPenalty = dailyPenalty * daysLate;

  return Math.min(totalDailyPenalty, monthlyCap);
};
