const axios = require('axios');
const crypto = require('crypto');

/**
 * Generate M-Pesa API password (Base64 encoded string)
 * @param {string} shortcode - Business Shortcode (e.g., '174379')
 * @param {string} passkey - M-Pesa API Passkey
 * @param {string} timestamp - Generated timestamp (format: 'YYYYMMDDHHmmss')
 * @returns {string} Base64 encoded password
 */
const generateMpesaPassword = (shortcode, passkey, timestamp) => {
  const concatenated = `${shortcode}${passkey}${timestamp}`;
  return Buffer.from(concatenated).toString('base64');
};

/**
 * Generate Safaricom-compatible timestamp (format: 'YYYYMMDDHHmmss')
 * @returns {string} Timestamp
 */
const generateTimestamp = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
};

/**
 * Get M-Pesa OAuth token (valid for 1 hour)
 * @returns {Promise<string>} Access token
 */
const getMpesaAuthToken = async () => {
  try {
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get(
      `${process.env.MPESA_AUTH_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('M-Pesa Auth Error:', error.response?.data || error.message);
    throw new Error('Failed to get M-Pesa token');
  }
};

/**
 * Validate Safaricom callback origin IP (whitelist Safaricom IPs)
 * @param {string} ip - Request IP address
 * @returns {boolean} True if IP is valid
 */
const validateCallbackIP = (ip) => {
  const safaricomIPs = [
    '196.201.214.200', '196.201.214.206', 
    '196.201.213.114', '196.201.212.127'
  ];
  return safaricomIPs.includes(ip);
};

/**
 * Encrypt sensitive data (e.g., callback payloads)
 * @param {string} text - Data to encrypt
 * @returns {string} Encrypted string
 */
const encryptData = (text) => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
    Buffer.from(process.env.ENCRYPTION_IV, 'hex')
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

module.exports = {
  generateMpesaPassword,
  generateTimestamp,
  getMpesaAuthToken,
  validateCallbackIP,
  encryptData,
};