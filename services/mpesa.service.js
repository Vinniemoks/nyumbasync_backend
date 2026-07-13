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
      CallBackURL: this._callbackUrl(),
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
      // Never log credential-derived or PII fields (assessment C12).
      logTransaction('MPESA_STK_FAIL', {
        error: error.response?.data || error.message,
        reference,
        amount,
        shortCode: process.env.MPESA_SHORTCODE ? '***' : undefined,
      });
      throw new Error('MPESA_REQUEST_FAILED');
    }
  }

  // Register the C2B Validation + Confirmation URLs for the Paybill. One-time
  // (admin) action. ResponseType 'Cancelled' tells Safaricom to auto-cancel a
  // payment if our Validation URL is unreachable, rather than complete it.
  async registerC2BUrls() {
    const token = await this._getAuthToken();
    const payload = {
      ShortCode: process.env.MPESA_C2B_SHORTCODE || process.env.MPESA_SHORTCODE,
      ResponseType: 'Cancelled',
      ConfirmationURL: process.env.MPESA_CONFIRMATION_URL,
      ValidationURL: process.env.MPESA_VALIDATION_URL
    };
    const response = await axios.post(
      `${this._getBaseUrl()}/mpesa/c2b/v1/registerurl`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return response.data;
  }

  // Reverse a completed C2B transaction (e.g. a payment that arrived after the
  // account number expired). Requires the reversal initiator credentials.
  async reverseTransaction({ transactionId, amount, receiverShortcode, remarks }) {
    const token = await this._getAuthToken();
    const shortcode = receiverShortcode || process.env.MPESA_C2B_SHORTCODE || process.env.MPESA_SHORTCODE;
    const payload = {
      Initiator: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      CommandID: 'TransactionReversal',
      TransactionID: transactionId,
      Amount: amount,
      ReceiverParty: shortcode,
      RecieverIdentifierType: '11', // organization shortcode
      ResultURL: process.env.MPESA_REVERSAL_RESULT_URL || this._callbackUrl(),
      QueueTimeOutURL: process.env.MPESA_REVERSAL_TIMEOUT_URL || this._callbackUrl(),
      Remarks: (remarks || 'Expired rent payment auto-reversal').slice(0, 100),
      Occasion: 'AutoReversal'
    };
    const response = await axios.post(
      `${this._getBaseUrl()}/mpesa/reversal/v1/request`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return response.data;
  }

  // Whether reversal credentials are provisioned (needed to auto-refund late pays).
  isReversalConfigured() {
    return Boolean(process.env.MPESA_INITIATOR_NAME && process.env.MPESA_SECURITY_CREDENTIAL);
  }

  // True only when explicitly pointed at Safaricom production. Defaults to
  // sandbox so a misconfigured env can never accidentally charge real money.
  _isLive() {
    return ['production', 'live', 'prod'].includes((process.env.MPESA_ENV || '').toLowerCase());
  }

  _getBaseUrl() {
    return this._isLive()
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  // Resolve the STK callback URL. Prefer the explicit MPESA_CALLBACK_URL env
  // (what Daraja is registered with); fall back to BASE_URL + the mounted
  // callback route.
  _callbackUrl() {
    if (process.env.MPESA_CALLBACK_URL) return process.env.MPESA_CALLBACK_URL;
    const base = process.env.BASE_URL || process.env.API_BASE_URL || '';
    return `${base.replace(/\/$/, '')}/api/v1/payments/mpesa-callback`;
  }

  // Whether the minimum Daraja credentials are present. Lets callers fail fast
  // with a clear message instead of a generic auth error.
  isConfigured() {
    return Boolean(
      process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY
    );
  }

  _generatePassword(timestamp) {
    const passkey = process.env.MPESA_PASSKEY;
    // Safaricom requires Base64(shortcode + passkey + timestamp)
    return Buffer.from(`${process.env.MPESA_SHORTCODE}${passkey}${timestamp}`).toString('base64');
  }

  _generateTimestamp() {
    return new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);
  }
}

module.exports = new MpesaService();
