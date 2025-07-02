module.exports = {
  // Authentication
  INVALID_PHONE: {
    code: 'AUTH_001',
    message: 'Invalid Kenyan phone number',
    solution: 'Use format 2547XXXXXXXX or 2541XXXXXXXX'
  },

  // Payments
  MPESA_FAILED: {
    code: 'PAY_001',
    message: 'M-Pesa payment failed',
    action: 'Retry or use USSD *544#',
    swahili: 'Malipo ya M-Pesa yameshindikana'
  },

  // Properties
  DEPOSIT_EXCEEDED: {
    code: 'PROP_001',
    message: 'Deposit exceeds 3 months rent',
    legalReference: 'Kenyan Rental Act Section 12(2)'
  },

  // Maintenance
  VENDOR_UNAVAILABLE: {
    code: 'MTN_001',
    message: 'No available vendors in your subcounty',
    escalation: 'Contact landlord directly',
    nairobiHotline: '0709119119'
  },

  // Legal
  LEASE_TERMINATION: {
    code: 'LEGAL_001',
    message: 'Insufficient notice period',
    minimumNotice: {
      landlord: '2 months',
      tenant: '1 month'
    }
  }
};

/**
 * Gets error response for API
 */
exports.getErrorResponse = (errorKey, additionalData = {}) => {
  const error = this[errorKey] || {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred'
  };
  
  return {
    success: false,
    error: {
      ...error,
      ...additionalData,
      timestamp: new Date().toLocaleString('en-KE', { 
        timeZone: 'Africa/Nairobi' 
      })
    }
  };
};
