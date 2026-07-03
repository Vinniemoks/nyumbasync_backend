/**
 * One-off migration: normalize User.phone to canonical 254XXXXXXXXX form.
 *
 * Historically phones were stored as-entered ("+254724093238", "0712...",
 * "254..."), which let format variants bypass the unique phone index and
 * create duplicate accounts. Signup/login now normalize on the way in;
 * this script fixes the rows that are already in the DB.
 *
 * Usage:
 *   node scripts/normalize-phone-numbers.js            # dry run (default)
 *   node scripts/normalize-phone-numbers.js --apply    # write changes
 *
 * Collisions (two accounts whose phones normalize to the same value, e.g.
 * "254700000001" and "+254700000001") are never merged or deleted — they
 * are reported so they can be resolved manually first.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { connectWithRetry } = require('../config/database');
const { formatKenyanPhone } = require('../utils/formatters');

const APPLY = process.argv.includes('--apply');

async function normalizePhones() {
  await connectWithRetry();

  const users = await User.find({}, { phone: 1, email: 1 }).lean();
  console.log(`Scanned ${users.length} users${APPLY ? '' : ' (dry run — pass --apply to write)'}\n`);

  // Map normalized phone -> users that end up there, to detect collisions
  const byNormalized = new Map();
  for (const user of users) {
    const normalized = formatKenyanPhone(user.phone) || user.phone;
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, []);
    byNormalized.get(normalized).push(user);
  }

  let updated = 0;
  let collisions = 0;
  let unparseable = 0;

  for (const [normalized, group] of byNormalized) {
    if (group.length > 1) {
      collisions++;
      console.log(`COLLISION on ${normalized} — resolve manually, skipping:`);
      for (const u of group) {
        console.log(`  ${u._id}  phone="${u.phone}"  email=${u.email}`);
      }
      continue;
    }

    const [user] = group;
    if (!formatKenyanPhone(user.phone)) {
      unparseable++;
      console.log(`UNPARSEABLE: ${user._id}  phone="${user.phone}"  email=${user.email}`);
      continue;
    }
    if (user.phone === normalized) continue;

    console.log(`${user._id}  "${user.phone}" -> "${normalized}"`);
    if (APPLY) {
      await User.updateOne({ _id: user._id }, { $set: { phone: normalized } });
    }
    updated++;
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'}: ${updated}`);
  console.log(`Collisions skipped: ${collisions}`);
  console.log(`Unparseable skipped: ${unparseable}`);

  await mongoose.disconnect();
}

normalizePhones().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
