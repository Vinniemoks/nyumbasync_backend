#!/usr/bin/env node
/**
 * Emergency MFA reset script.
 *
 * Use this when an admin is locked out because mfaEnabled is true but they
 * have no way to generate a code (lost authenticator, email delivery issues,
 * etc.). The script connects directly to the database, clears MFA fields for
 * the matching user, and exits.
 *
 * Usage:
 *   MONGODB_URI="..." node scripts/reset-mfa.js mokua.vinny@gmail.com
 *   MONGODB_URI="..." node scripts/reset-mfa.js 254712345678
 *   MONGODB_URI="..." node scripts/reset-mfa.js NYM12345678
 *
 * After running, the user can log in with their password only and must set up
 * 2FA again from their dashboard.
 */

require('dotenv').config();
const { connectWithRetry, mongoose } = require('../config/database');
const User = require('../models/user.model');

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: node scripts/reset-mfa.js <email|phone|accountNumber>');
    process.exit(1);
  }

  await connectWithRetry();

  const query = {
    $or: [
      { email: identifier.toLowerCase() },
      { accountNumber: identifier.toUpperCase() },
    ]
  };

  // If the identifier looks like a phone, also match normalized phone.
  const digits = identifier.replace(/\D/g, '');
  if (/^(254[17]\d{8}|0[17]\d{8}|[17]\d{8})$/.test(digits)) {
    let phone = digits;
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (phone.length === 9) phone = '254' + phone;
    query.$or.push({ phone });
  }

  const user = await User.findOne(query);
  if (!user) {
    console.error('No user found for identifier:', identifier);
    await mongoose.disconnect();
    process.exit(1);
  }

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaBackupCodes = undefined;
  user.mfaVerified = false;
  user.mfaEmailEnabled = false;
  await user.save({ validateBeforeSave: false });

  console.log('MFA reset successfully for:');
  console.log('  Name: ', [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email);
  console.log('  Email:', user.email);
  console.log('  Phone:', user.phone);
  console.log('  Account:', user.accountNumber);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to reset MFA:', err.message);
  process.exit(1);
});
