// Cryptographically secure random helpers.
//
// Math.random() is a non-cryptographic PRNG: its output is predictable and must
// never be used for anything an attacker could guess to gain access — OTPs,
// verification codes, temporary passwords, or tokens. These helpers use Node's
// crypto module (CSPRNG) instead. See the security audit (2026-07-12).

const crypto = require('crypto');

/**
 * Generate a numeric verification code / OTP with no modulo bias.
 * @param {number} digits - length of the code (default 6)
 * @returns {string} zero-padded numeric string
 */
function secureNumericCode(digits = 6) {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max); // uniform in [0, max)
  return n.toString().padStart(digits, '0');
}

/**
 * Generate a strong temporary password: URL-safe base64 with guaranteed
 * upper/lower/digit coverage. Used for admin-provisioned accounts that the
 * user must reset on first login.
 * @param {number} bytes - entropy in bytes (default 12 → ~16 chars)
 * @returns {string}
 */
function secureTempPassword(bytes = 12) {
  const base = crypto.randomBytes(bytes).toString('base64url');
  // Guarantee complexity so it passes any downstream password policy.
  const upper = String.fromCharCode(65 + crypto.randomInt(0, 26));
  const lower = String.fromCharCode(97 + crypto.randomInt(0, 26));
  const digit = String.fromCharCode(48 + crypto.randomInt(0, 10));
  return `${base}${upper}${lower}${digit}`;
}

/**
 * Generate a random opaque token (hex) for references/one-time links.
 * @param {number} bytes - entropy in bytes (default 32)
 * @returns {string} hex string
 */
function secureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { secureNumericCode, secureTempPassword, secureToken };
