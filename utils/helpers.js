const moment = require('moment');
const mongoose = require('mongoose');

/**
 * Utility helper functions for NyumbaSync backend
 */
module.exports = {
  /**
   * Format API response consistently
   * @param {*} data - Response data
   * @param {string} message - Optional message
   * @param {boolean} success - Whether the operation was successful
   * @returns {Object} Formatted response
   */
  formatResponse: (data = null, message = '', success = true) => {
    return {
      success,
      message,
      data,
      timestamp: moment().format()
    };
  },

  /**
   * Format error response consistently
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {*} details - Additional error details
   * @returns {Object} Formatted error response
   */
  formatError: (message, statusCode = 400, details = null) => {
    return {
      success: false,
      message,
      statusCode,
      details,
      timestamp: moment().format()
    };
  },

  /**
   * Validate MongoDB ID
   * @param {string} id - ID to validate
   * @returns {boolean} Whether the ID is valid
   */
  isValidId: (id) => {
    return mongoose.Types.ObjectId.isValid(id);
  },

  /**
   * Format currency for display (Kenyan Shillings)
   * @param {number} amount - Amount to format
   * @returns {string} Formatted currency string
   */
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2
    }).format(amount);
  },

  /**
   * Generate a random reference number
   * @param {string} prefix - Optional prefix
   * @param {number} length - Length of random part
   * @returns {string} Generated reference
   */
  generateReference: (prefix = 'NS', length = 8) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = prefix;
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Paginate array of results
   * @param {Array} data - Data to paginate
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @returns {Object} Paginated result
   */
  paginate: (data, page = 1, limit = 10) => {
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = data.length;
    
    const result = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: data.slice(startIndex, endIndex)
    };

    if (endIndex < total) {
      result.next = page + 1;
    }

    if (startIndex > 0) {
      result.previous = page - 1;
    }

    return result;
  },

  /**
   * Sanitize phone number to standard format (2547XXXXXXXX)
   * @param {string} phone - Raw phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber: (phone) => {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle numbers starting with 0
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    }
    // Handle numbers starting with +254
    else if (cleaned.startsWith('254')) {
      cleaned = cleaned;
    }
    // Handle numbers starting with 7 (assuming Kenyan number)
    else if (cleaned.startsWith('7') && cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  },

  /**
   * Calculate days between two dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} Number of days
   */
  daysBetween: (startDate, endDate) => {
    const start = moment(startDate);
    const end = moment(endDate);
    return end.diff(start, 'days');
  },

  /**
   * Generate a random OTP code
   * @param {number} length - Length of OTP
   * @returns {string} Generated OTP
   */
  generateOTP: (length = 6) => {
    const digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < length; i++) {
      OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
  }
};