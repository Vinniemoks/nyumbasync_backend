const logger = require('../utils/logger');

// Nairobi-specific error responses
const kenyanErrorMessages = {
  MPESA_FAILURE: 'Pesa request failed. Please try again or pay via USSD *544#',
  INVALID_PHONE: 'Enter a valid Kenyan phone (2547XXXXXXXX)',
  LOCATION_OUTSIDE: 'Service available only within Nairobi County',
  RENT_CAP_EXCEEDED: 'Rent increase beyond 7% requires tenant consent per Kenyan law'
};

const errorHandler = (err, req, res, next) => {
  // Log with Kenyan timestamp
  const timestamp = new Date().toLocaleString('en-KE', { 
    timeZone: 'Africa/Nairobi' 
  });
  
  logger.error(`${timestamp} - ${err.stack}`);

  // Special handling for M-Pesa errors
  if (err.message.includes('MPESA')) {
    return res.status(503).json({
      error: kenyanErrorMessages.MPESA_FAILURE,
      retrySuggested: true
    });
  }

  // Kenyan validation errors
  const knownError = Object.keys(kenyanErrorMessages).find(
    key => err.message.includes(key)
  );
  
  if (knownError) {
    return res.status(400).json({
      error: kenyanErrorMessages[knownError],
      localResolution: 'Contact 0700NYUMBA'
    });
  }

  // Default
  res.status(500).json({
    error: 'Server error. Our team in Nairobi has been notified'
  });
};

module.exports = errorHandler;
