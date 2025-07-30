const axios = require('axios');
const crypto = require('crypto');
const { logTransaction } = require('../utils/logger');

class MpesaService {
  constructor() {
    this.authToken = null;
    this.tokenExpiry = null;
  }

  async _getAuthToken() {
    if (this.authToken && new Date() < this.tokenExpiry) {
      return this.authToken;
    }

    console.log('MPESA_CONSUMER_KEY:', process.env.MPESA_CONSUMER_KEY);
    console.log('MPESA_CONSUMER_SECRET:', process.env.MPESA_CONSUMER_SECRET);

    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    
    try {
      const response = await axios.get(
        `${this._getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: { 'Authorization': `Basic ${auth}` },
          timeout: 5000 // Safaricom's 5s timeout
        }
      );

      this.authToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));
      return this.authToken;
    } catch (error) {
      console.error('Error in _getAuthToken:', error.message);
      logTransaction('MPESA_AUTH_FAIL', error.response?.data);
      throw new Error('MPESA_AUTH_FAILED');
    }
  }

  async initiateSTKPush(phone, amount, reference) {
    const token = await this._getAuthToken();
    const timestamp = this._generateTimestamp();
    
    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: this._generatePassword(timestamp),
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: `${process.env.BASE_URL}/api/v1/mpesa-callback`,
      AccountReference: reference,
      TransactionDesc: 'NyumbaSync Rent Payment'
    };

    try {
      const response = await axios.post(
        `${this._getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000 // Extended timeout for Kenyan networks
        }
      );

      logTransaction('MPESA_STK_PUSH', {
        reference,
        phone: phone.replace(/(d{4})(d{3})(d{3})/, '*******$3') // Mask phone
      });

      return response.data;
    } catch (error) {
      logTransaction('MPESA_STK_FAIL', {
        error: error.response?.data || error.message,
        payload
      });
      throw new Error('MPESA_REQUEST_FAILED');
    }
  }

  _getBaseUrl() {
    return process.env.NODE_ENV === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
  }

  _generatePassword(timestamp) {
    const passkey = process.env.MPESA_PASSKEY;
    return crypto
      .createHash('sha256')
      .update(`${process.env.MPESA_SHORTCODE}${passkey}${timestamp}`)
      .digest('hex');
  }

  _generateTimestamp() {
    return new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);
  }
}

module.exports = new MpesaService();
