/**
 * Set a known backup code for a super-admin so MFA login can be completed
 * without an authenticator app. Useful for recovery, demos, and first-time
 * setup when the QR-code step can't be done.
 *
 * Usage:
 *   node scripts/set-super-admin-backup-code.js \
 *        --email super@nyumbasync.com [--phone 254712345678] \
 *        [--first Super] [--last Admin] [--password 'S3cure!pass']
 *
 * If the account doesn't exist, a super_admin is created with the provided
 * (or generated) details and MFA is fully enabled.
 * If the account exists, its MFA settings are updated — the backup code is
 * set, and a TOTP secret is generated so the account can log in via
 * authenticator OR backup code.
 *
 * The backup code (36595971) is hashed (SHA-256) before storage, same as
 * the normal MFA flow.
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { connectWithRetry } = require('../config/database');
const { formatKenyanPhone } = require('../utils/formatters');

const BACKUP_CODE = '36595971';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email') || 'superadmin@nyumbasync.com';
  let phone = arg('phone');
  const first = arg('first') || 'Super';
  const last = arg('last') || 'Admin';
  let password = arg('password');

  await connectWithRetry();

  // Find existing super admin by email
  let user = await User.findOne({ email: email.toLowerCase() }).select('+password +mfaSecret +mfaBackupCodes');

  // Generate password if creating a new user and none provided
  let generated = false;
  if (!user && !password) {
    password = crypto.randomBytes(12).toString('base64url') + '!1a';
    generated = true;
  }

  // Generate a TOTP secret if the user doesn't have one
  const speakeasy = require('speakeasy');
  const secret = user?.mfaSecret || speakeasy.generateSecret({
    name: `NyumbaSync (${email})`,
    issuer: 'NyumbaSync',
    length: 32
  }).base32;

  // Hash the backup code using the same algorithm as the MFA service
  const hashedBackupCode = crypto
    .createHash('sha256')
    .update(BACKUP_CODE)
    .digest('hex');

  if (user) {
    // Update existing user
    console.log(`Found existing user: ${user.email} (${user.role})`);

    // Promote to super_admin if not already
    const roles = new Set([...(user.roles || [user.role]), 'super_admin']);
    user.roles = [...roles];
    user.role = 'super_admin';

    // Set/reset password if provided
    if (password) {
      user.password = password; // hashed by pre-save hook
    }

    // Enable MFA and set the backup code
    user.mfaSecret = secret;
    user.mfaEnabled = true;
    user.mfaVerified = true;
    user.mfaBackupCodes = [hashedBackupCode];

    // Ensure phone is set (required by model)
    if (!user.phone && phone) {
      user.phone = formatKenyanPhone(phone);
    }

    await user.save();
    console.log(`\n✅ Updated ${email} to super_admin with MFA enabled.`);
  } else {
    // Create new super admin
    if (!phone) {
      console.error('Creating a new user requires --phone (e.g. --phone 254712345678).');
      process.exit(1);
    }

    user = await User.create({
      email: email.toLowerCase(),
      phone: formatKenyanPhone(phone),
      firstName: first,
      lastName: last,
      password, // hashed by the model's pre-save hook
      role: 'super_admin',
      roles: ['super_admin'],
      isEmailVerified: true,
      mfaSecret: secret,
      mfaEnabled: true,
      mfaVerified: true,
      mfaBackupCodes: [hashedBackupCode],
    });
    console.log(`\n✅ Created new super_admin: ${email}`);
  }

  console.log(`\n📱 Phone: ${user.phone}`);
  console.log(`🔑 Backup code: ${BACKUP_CODE}`);
  console.log(`   (Hashed: ${hashedBackupCode})`);

  if (generated) {
    console.log(`\n🔐 Generated password: ${password}`);
    console.log('   Store it now — it is not recoverable. Change it after first login.');
  }

  console.log(`\n📝 To log in:`);
  console.log(`   1. POST /api/v1/auth/login with { identifier: "${email}", password: "<your password>" }`);
  console.log(`   2. You'll receive an mfaSessionToken`);
  console.log(`   3. POST /api/v1/auth/mfa/verify-login with { mfaSessionToken, backupCode: "${BACKUP_CODE}" }`);
  console.log(`\n💡 The TOTP secret is also set, so you can scan the QR code with an authenticator app if preferred.`);
  console.log(`   Secret (base32): ${secret}`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
