/**
 * Inspect and optionally fix a user's roles / verification status.
 *
 * Usage:
 *   node scripts/inspect-and-fix-user.js --email mokua.vinny@gmail.com [--fix]
 *
 * --fix will:
 *   - populate `roles` with all self-registrable + admin roles if empty
 *   - set `role` to the first role in roles
 *   - ensure `isActive` and `status` are active
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectWithRetry } = require('../config/database');
const User = require('../models/user.model');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const ALL_ROLES = ['tenant', 'landlord', 'agent', 'manager', 'vendor', 'admin', 'super_admin'];

async function main() {
  const email = arg('email');
  const shouldFix = process.argv.includes('--fix');

  if (!email) {
    console.error('Required: --email. Example: node scripts/inspect-and-fix-user.js --email mokua.vinny@gmail.com [--fix]');
    process.exit(1);
  }

  await connectWithRetry();

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +mfaEnabled +mfaSecret +roles');

  if (!user) {
    console.error(`No user found for ${email}`);
    await mongoose.connection.close();
    process.exit(1);
  }

  console.log('User found:');
  console.log({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    roles: user.roles,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    mfaSecret: user.mfaSecret ? 'set' : 'not set',
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  });

  if (shouldFix) {
    const currentRoles = Array.isArray(user.roles) && user.roles.length
      ? [...new Set(user.roles)]
      : (user.role ? [user.role] : []);

    // Merge in all roles the user requested to have.
    const fixedRoles = [...new Set([...currentRoles, ...ALL_ROLES])];
    user.roles = fixedRoles;
    user.role = fixedRoles[0];
    user.isActive = true;
    user.status = 'active';
    await user.save({ validateBeforeSave: false });
    console.log('\nFixed roles:', user.roles);
    console.log('Active role:', user.role);
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
