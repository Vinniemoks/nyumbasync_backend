const Twilio = require('twilio');
const axios = require('axios');
const { kenyaPhoneFormatter } = require('../utils/formatters');

class SMSService {
  constructor() {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async sendSMS(to, message) {
    try {
      const formattedPhone = kenyaPhoneFormatter(to); // Ensures 254 format
      
      const response = await this.client.messages.create({
        body: this._truncateForKenya(message),
        from: process.env.TWILIO_KE_NUMBER, // Kenyan virtual number
        to: formattedPhone
      });

      return {
        success: true,
        sid: response.sid,
        cost: response.price // In KES
      };
    } catch (error) {
      console.error('SMS_FAILURE:', error);
      return this._fallbackToAlternativeProvider(to, message);
    }
  }

  /**
   * Send SMS verification code
   * @param {string} phoneNumber - Phone number in international format
   * @param {string} code - Verification code
   */
  async sendVerificationCode(phoneNumber, code) {
    const message = `Your NyumbaSync verification code is: ${code}. Valid for 10 minutes.`;
    return this.sendSMS(phoneNumber, message);
  }

  /**
   * Send general SMS notification
   * @param {string} phoneNumber - Phone number
   * @param {string} message - Message content
   */
  async sendNotification(phoneNumber, message) {
    return this.sendSMS(phoneNumber, message);
  }

  /**
   * Generate verification code
   * @returns {string} 6-digit verification code
   */
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  _truncateForKenya(message) {
    // Kenyan SMS have 160-char limit
    return message.length > 160 ? message.substring(0, 157) + '...' : message;
  }

  async _fallbackToAlternativeProvider(to, message) {
    // Fallback to Africa's Talking or local SMPP
    try {
      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        {
          username: process.env.AT_USERNAME,
          to: [to],
          message: message,
          from: 'NYUMBASYNC'
        },
        {
          headers: {
            'ApiKey': process.env.AT_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return {
        success: true,
        response: response.data
      };
    } catch (fallbackError) {
      console.error('FALLBACK_SMS_FAILURE:', fallbackError);
      throw new Error('SMS_PROVIDERS_UNAVAILABLE');
    }
  }
}

module.exports = new SMSService();