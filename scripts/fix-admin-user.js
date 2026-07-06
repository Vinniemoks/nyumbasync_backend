#!/usr/bin/env node
/**
 * One-off script to repair the super-admin account.
 * Sets role='super_admin', roles=['super_admin'], and ensures the account is active.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');

const TARGET_EMAIL = process.argv[2] || 'mokua.vinny@gmail.com';

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: TARGET_EMAIL });
    if (!user) {
      console.error(`User ${TARGET_EMAIL} not found`);
      process.exit(1);
    }

    console.log('Before:', {
      id: user._id,
      email: user.email,
      role: user.role,
      roles: user.roles,
      status: user.status,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
    });

    user.role = 'super_admin';
    user.roles = ['super_admin'];
    user.status = 'active';
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    const updated = await User.findById(user._id);
    console.log('After:', {
      id: updated._id,
      email: updated.email,
      role: updated.role,
      roles: updated.roles,
      status: updated.status,
      emailVerified: updated.emailVerified,
    });

    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
