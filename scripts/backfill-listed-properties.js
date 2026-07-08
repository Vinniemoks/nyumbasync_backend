/**
 * One-off migration: mark existing available properties as publicly listed.
 *
 * `listing.isListed` used to default to false, and every property created
 * through the v1 dashboard flow stored that default explicitly — so the
 * public tenant listings page showed nothing. The default is now true and
 * the public query treats only an explicit false as unlisted, but rows
 * already in the DB still carry the old default and must be flipped.
 *
 * Only available properties are touched; explicit landlord opt-out did not
 * exist before this migration, so every stored `false` is a schema default.
 *
 * Usage:
 *   node scripts/backfill-listed-properties.js           # dry run (default)
 *   node scripts/backfill-listed-properties.js --apply   # write changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/property.model');
const { connectWithRetry } = require('../config/database');

const APPLY = process.argv.includes('--apply');

async function backfill() {
  await connectWithRetry();

  const filter = {
    status: 'available',
    isAvailable: true,
    'listing.isListed': false,
  };

  const count = await Property.countDocuments(filter);
  console.log(`${count} available properties are currently unlisted${APPLY ? '' : ' (dry run — pass --apply to write)'}`);

  if (APPLY && count > 0) {
    const res = await Property.updateMany(filter, { $set: { 'listing.isListed': true } });
    console.log(`Updated ${res.modifiedCount} properties — they are now publicly visible.`);
  }

  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
