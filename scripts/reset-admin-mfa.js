/**
 * Reset/remove all MFA requirements from an admin account.
 *
 * Use this only when an admin is locked out (e.g. WhatsApp/email delivery
 * failed, authenticator was lost, or MFA was enabled before setup completed).
 * The admin can then log in with just their password and set up a new
 * authenticator from the dashboard.
 *
 * Usage:
 *   node scripts/reset-admin-mfa.js --email admin@example.com
 *
 * The script clears TOTP secrets, backup codes, email-OTP state, pending
 * action OTPs, and IP verification flags. It does NOT change the password.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { connectWithRetry } = require('../config/database');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  if (!email) {
    console.error('Required: --email. Example: node scripts/reset-admin-mfa.js --email admin@example.com');
    process.exit(1);
  }

  await connectWithRetry();

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+mfaSecret +mfaBackupCodes +actionOtp +ipVerificationCode'
  );

  if (!user) {
    console.error(`No user found for ${email}`);
    await mongoose.connection.close();
    process.exit(1);
  }

  const adminRoles = ['admin', 'super_admin'];
  const isAdmin = adminRoles.includes(user.role) ||
    (Array.isArray(user.roles) && user.roles.some(r => adminRoles.includes(r)));

  if (!isAdmin) {
    console.warn(`User ${email} is not an admin. Continuing anyway because they may need access.`);
  }

  // Clear every MFA-related field so login falls back to password-only.
  user.mfaEnabled = false;
  user.mfaVerified = false;
  user.mfaSecret = undefined;
  user.mfaBackupCodes = undefined;
  user.mfaEmailEnabled = false;
  user.actionOtp = undefined;
  user.actionOtpExpiry = undefined;
  user.actionOtpPurpose = undefined;
  user.ipVerificationCode = undefined;
  user.ipVerificationCodeExpiry = undefined;

  await user.save({ validateBeforeSave: false });

  console.log(`MFA reset complete for ${email}.`);
  console.log('The user can now log in with their password and set up Google Authenticator from the dashboard.');

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
