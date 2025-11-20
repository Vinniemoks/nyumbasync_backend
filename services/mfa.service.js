/**
 * Multi-Factor Authentication (MFA) Service
 * Handles TOTP-based two-factor authentication
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

class MFAService {
  /**
   * Generate MFA secret for user
   * @param {string} email - User email
   * @returns {Object} Secret and QR code
   */
  async generateSecret(email) {
    try {
      const secret = speakeasy.generateSecret({
        name: `NyumbaSync (${email})`,
        issuer: 'NyumbaSync',
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        otpauthUrl: secret.otpauth_url
      };
    } catch (error) {
      throw new Error(`Failed to generate MFA secret: ${error.message}`);
    }
  }

  /**
   * Verify MFA token
   * @param {string} secret - User's MFA secret
   * @param {string} token - 6-digit token from authenticator app
   * @returns {boolean} Verification result
   */
  verifyToken(secret, token) {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2 // Allow 2 time steps before/after for clock drift
      });
    } catch (error) {
      throw new Error(`Failed to verify MFA token: ${error.message}`);
    }
  }

  /**
   * Generate backup codes for account recovery
   * @param {number} count - Number of backup codes to generate
   * @returns {Array<string>} Array of backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup code for storage
   * @param {string} code - Backup code
   * @returns {string} Hashed code
   */
  hashBackupCode(code) {
    return crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
  }

  /**
   * Verify backup code
   * @param {string} code - Provided backup code
   * @param {Array<string>} hashedCodes - Array of hashed backup codes
   * @returns {Object} Verification result and remaining codes
   */
  verifyBackupCode(code, hashedCodes) {
    const hashedInput = this.hashBackupCode(code);
    const index = hashedCodes.indexOf(hashedInput);

    if (index === -1) {
      return { valid: false, remainingCodes: hashedCodes };
    }

    // Remove used code
    const remainingCodes = hashedCodes.filter((_, i) => i !== index);

    return {
      valid: true,
      remainingCodes,
      codesLeft: remainingCodes.length
    };
  }

  /**
   * Generate MFA session token (temporary token after password verification)
   * @param {string} userId - User ID
   * @returns {string} MFA session token
   */
  generateMFASessionToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const payload = `${userId}:${token}:${Date.now()}`;
    return Buffer.from(payload).toString('base64');
  }

  /**
   * Verify MFA session token
   * @param {string} token - MFA session token
   * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes)
   * @returns {Object} Verification result with userId
   */
  verifyMFASessionToken(token, maxAge = 5 * 60 * 1000) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [userId, , timestamp] = decoded.split(':');

      const age = Date.now() - parseInt(timestamp);
      if (age > maxAge) {
        return { valid: false, error: 'MFA session expired' };
      }

      return { valid: true, userId };
    } catch (error) {
      return { valid: false, error: 'Invalid MFA session token' };
    }
  }
}

module.exports = new MFAService();
