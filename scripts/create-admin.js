/**
 * Bootstrap (or reset) an admin account.
 *
 * Public signup deliberately refuses the admin role (see auth.controller's
 * SELF_REGISTRABLE_ROLES), so the very first admin must be created out of
 * band with this script. Further admins can then be provisioned from the
 * admin dashboard by an existing admin.
 *
 * Usage:
 *   node scripts/create-admin.js --email admin@example.com --phone 254712345678 \
 *        --first Jane --last Mokua [--password 'S3cure!pass']
 *
 * If --password is omitted a strong random one is generated and printed.
 * If a user with that email already exists, the script promotes it to admin
 * (adds the role) instead of creating a duplicate; with --password it also
 * resets the password — handy for a locked-out admin.
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { connectWithRetry } = require('../config/database');
const { formatKenyanPhone } = require('../utils/formatters');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const phone = arg('phone');
  const first = arg('first');
  const last = arg('last');
  let password = arg('password');

  if (!email) {
    console.error('Required: --email. See header comment for usage.');
    process.exit(1);
  }

  await connectWithRetry();

  const existing = await User.findOne({ email: email.toLowerCase() }).select('+password');

  // Generate a password only when we'll actually set one (new account).
  let generated = false;
  if (!password && !existing) {
    password = crypto.randomBytes(12).toString('base64url') + '!1a';
    generated = true;
  }
  if (existing) {
    const roles = new Set([...(existing.roles || [existing.role]), 'admin']);
    existing.roles = [...roles];
    existing.role = 'admin';
    // Only touch the password when one was explicitly provided.
    if (arg('password')) existing.password = password; // hashed by pre-save hook
    await existing.save();
    console.log(`Promoted existing user ${email} to admin${arg('password') ? ' and reset password' : ''}.`);
  } else {
    if (!phone || !first || !last) {
      console.error('Creating a new user requires --phone, --first and --last.');
      process.exit(1);
    }
    await User.create({
      email: email.toLowerCase(),
      phone: formatKenyanPhone(phone),
      firstName: first,
      lastName: last,
      password, // hashed by the model's pre-save hook — never pre-hash here
      role: 'admin',
      roles: ['admin'],
      isEmailVerified: true,
    });
    console.log(`Created admin ${email}.`);
  }

  if (generated) {
    console.log(`Generated password: ${password}`);
    console.log('Store it now — it is not recoverable. Change it after first login.');
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
