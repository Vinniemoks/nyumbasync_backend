/**
 * Password History Service
 * Prevents password reuse by maintaining history of previous passwords
 */

const bcrypt = require('bcryptjs');

class PasswordHistoryService {
  constructor() {
    this.historyLimit = 5; // Remember last 5 passwords
  }

  /**
   * Check if password was used before
   * @param {string} newPassword - New password to check
   * @param {Array} passwordHistory - Array of previous password hashes
   * @returns {Promise<boolean>} True if password was used before
   */
  async isPasswordReused(newPassword, passwordHistory = []) {
    if (!passwordHistory || passwordHistory.length === 0) {
      return false;
    }

    // Check against each historical password
    for (const historyEntry of passwordHistory) {
      const hash = historyEntry.hash || historyEntry;
      const isMatch = await bcrypt.compare(newPassword, hash);
      if (isMatch) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add password to history
   * @param {string} passwordHash - Hashed password
   * @param {Array} currentHistory - Current password history
   * @returns {Array} Updated password history
   */
  addToHistory(passwordHash, currentHistory = []) {
    const newEntry = {
      hash: passwordHash,
      changedAt: new Date()
    };

    // Add new password to beginning of array
    const updatedHistory = [newEntry, ...currentHistory];

    // Keep only the last N passwords
    return updatedHistory.slice(0, this.historyLimit);
  }

  /**
   * Validate password against history
   * @param {string} newPassword - New password
   * @param {Array} passwordHistory - Password history
   * @returns {Promise<Object>} Validation result
   */
  async validatePassword(newPassword, passwordHistory = []) {
    const isReused = await this.isPasswordReused(newPassword, passwordHistory);

    if (isReused) {
      return {
        valid: false,
        error: `Password was used recently. Please choose a different password. Cannot reuse last ${this.historyLimit} passwords.`
      };
    }

    return {
      valid: true,
      message: 'Password is acceptable'
    };
  }

  /**
   * Get password age
   * @param {Date} lastChangedAt - Date when password was last changed
   * @returns {Object} Password age information
   */
  getPasswordAge(lastChangedAt) {
    if (!lastChangedAt) {
      return {
        days: 0,
        requiresChange: false
      };
    }

    const now = new Date();
    const ageInMs = now - new Date(lastChangedAt);
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

    // Recommend password change after 90 days
    const maxAge = 90;
    const requiresChange = ageInDays >= maxAge;

    return {
      days: ageInDays,
      requiresChange,
      daysUntilExpiry: Math.max(0, maxAge - ageInDays),
      message: requiresChange 
        ? 'Password has expired. Please change your password.'
        : `Password expires in ${maxAge - ageInDays} days.`
    };
  }

  /**
   * Clean old password history entries
   * @param {Array} passwordHistory - Password history
   * @param {number} maxAge - Maximum age in days (default: 365)
   * @returns {Array} Cleaned password history
   */
  cleanOldEntries(passwordHistory = [], maxAge = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAge);

    return passwordHistory.filter(entry => {
      const changedAt = new Date(entry.changedAt);
      return changedAt >= cutoffDate;
    });
  }

  /**
   * Get password history statistics
   * @param {Array} passwordHistory - Password history
   * @returns {Object} Statistics
   */
  getStats(passwordHistory = []) {
    if (!passwordHistory || passwordHistory.length === 0) {
      return {
        totalPasswords: 0,
        oldestPassword: null,
        newestPassword: null,
        averageAge: 0
      };
    }

    const now = new Date();
    const ages = passwordHistory.map(entry => {
      const changedAt = new Date(entry.changedAt);
      return Math.floor((now - changedAt) / (1000 * 60 * 60 * 24));
    });

    return {
      totalPasswords: passwordHistory.length,
      oldestPassword: passwordHistory[passwordHistory.length - 1]?.changedAt,
      newestPassword: passwordHistory[0]?.changedAt,
      averageAge: ages.length > 0 
        ? Math.floor(ages.reduce((a, b) => a + b, 0) / ages.length)
        : 0
    };
  }

  /**
   * Check if password change is required
   * @param {Date} lastChangedAt - Last password change date
   * @param {number} maxAge - Maximum password age in days
   * @returns {boolean} True if password change is required
   */
  isPasswordExpired(lastChangedAt, maxAge = 90) {
    if (!lastChangedAt) {
      return false;
    }

    const now = new Date();
    const ageInMs = now - new Date(lastChangedAt);
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

    return ageInDays >= maxAge;
  }

  /**
   * Get password strength requirements message
   * @returns {string} Requirements message
   */
  getRequirementsMessage() {
    return `Password must:
- Be at least 8 characters long
- Contain at least one uppercase letter
- Contain at least one lowercase letter
- Contain at least one number
- Contain at least one special character
- Not be one of your last ${this.historyLimit} passwords`;
  }
}

module.exports = new PasswordHistoryService();
