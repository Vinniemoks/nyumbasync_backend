const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

// Safaricom M-Pesa credentials with encryption
const encryptKey = (key) => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', 
    process.env.ENCRYPTION_KEY, 
    Buffer.alloc(16)
  );
  return cipher.update(key, 'utf8', 'hex') + cipher.final('hex');
};

const config = {
  env: process.env.NODE_ENV || 'sandbox',
  shortcode: process.env.MPESA_SHORTCODE || '174379',
  passkey: encryptKey(process.env.MPESA_PASSKEY),
  callbackURL: process.env.MPESA_CALLBACK_URL || 
    'https://api.nyumbasync.com/v1/payments/mpesa-callback',
  timeout: 5000, // Safaricom's 5s timeout requirement
};

// Dynamic API endpoints for Kenya
const endpoints = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

const getAuthToken = async () => {
  try {
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    
    const response = await axios.get(
      `${endpoints[config.env]}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: config.timeout
      }
    );
    
    return response.data.access_token;
  } catch (err) {
    logger.error(`M-Pesa auth failed: ${err.message}`);
    throw new Error('MPESA_AUTH_FAILURE');
  }
};

module.exports = {
  mpesaConfig: config,
  getAuthToken,
  endpoints,
  generateTimestamp: () => {
    return new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3); // YYYYMMDDHHmmss format
  }
};
