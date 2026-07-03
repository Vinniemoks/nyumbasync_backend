#!/usr/bin/env node
/**
 * Standalone test script for Paystack integration.
 * Initializes a test transaction and optionally verifies it.
 *
 * Usage:
 *   node scripts/test-paystack.js [recipient@email.com]
 *
 * Examples:
 *   node scripts/test-paystack.js
 *   node scripts/test-paystack.js test@nyumbasync.com
 */

require('dotenv').config();

const path = require('path');
const axios = require('axios');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const CALLBACK_URL = process.env.CARD_RETURN_URL;
const CURRENCY = process.env.PAYSTACK_CURRENCY || 'KES';
const BASE_URL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';

// Test amount: KSh 10 (minor unit = 1000)
const TEST_AMOUNT_KES = 10;
const TEST_AMOUNT_MINOR = TEST_AMOUNT_KES * 100;

const recipientEmail = process.argv[2] || 'test@nyumbasync.com';

// ---------------------------------------------------------------------------
// Helper: colorized logger
// ---------------------------------------------------------------------------

const log = {
  info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  error: (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  warn: (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  divider: () => console.log('\n────────────────────────────────────────\n'),
};

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

function preflight() {
  let failed = false;

  if (!SECRET_KEY) {
    log.error('PAYSTACK_SECRET_KEY is missing from .env');
    log.info('Add it to your .env file: PAYSTACK_SECRET_KEY=sk_test_...');
    failed = true;
  } else if (!SECRET_KEY.startsWith('sk_test_') && !SECRET_KEY.startsWith('sk_live_')) {
    log.warn('PAYSTACK_SECRET_KEY does not look like a standard Paystack key (expected sk_test_... or sk_live_...)');
  }

  if (!PUBLIC_KEY) {
    log.warn('PAYSTACK_PUBLIC_KEY is missing from .env (optional for this test, but required by frontend)');
  }

  if (!CALLBACK_URL) {
    log.warn('CARD_RETURN_URL is missing from .env (optional for test init, but required in production)');
  }

  if (failed) {
    log.divider();
    log.error('Aborting: cannot run test without PAYSTACK_SECRET_KEY.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Gateway adapter functions (mirrors services/gateways/index.js)
// ---------------------------------------------------------------------------

async function initializeTransaction({ email, amount, reference, callbackUrl, metadata }) {
  const response = await axios.post(
    `${BASE_URL}/transaction/initialize`,
    {
      email,
      amount: Math.round(amount * 100),
      currency: CURRENCY,
      reference,
      callback_url: callbackUrl,
      metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  const data = response.data?.data || {};
  return {
    authorizationUrl: data.authorization_url,
    reference: data.reference,
    accessCode: data.access_code,
  };
}

async function verifyTransaction(reference) {
  const response = await axios.get(
    `${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
      timeout: 10000,
    }
  );
  const data = response.data?.data || {};
  return {
    status: data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : 'pending',
    amount: typeof data.amount === 'number' ? data.amount / 100 : undefined,
    raw: data,
  };
}

// ---------------------------------------------------------------------------
// Main test flow
// ---------------------------------------------------------------------------

async function main() {
  log.divider();
  log.info('NyumbaSync Paystack Integration Test');
  log.info(`Recipient: ${recipientEmail}`);
  log.info(`Amount:    KSh ${TEST_AMOUNT_KES}`);
  log.info(`Currency:  ${CURRENCY}`);
  log.info(`Mode:      ${SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);
  log.divider();

  preflight();

  // 1. Generate a unique reference
  const reference = `nyumbasync_test_${Date.now()}`;
  log.info(`Generated reference: ${reference}`);

  // 2. Initialize the transaction
  let initResult;
  try {
    initResult = await initializeTransaction({
      email: recipientEmail,
      amount: TEST_AMOUNT_KES,
      reference,
      callbackUrl: CALLBACK_URL || 'https://nyumbasync.co.ke/payment/success',
      metadata: {
        tenant_email: recipientEmail,
        test: true,
        source: 'test-paystack-script',
      },
    });
  } catch (err) {
    log.error('Failed to initialize transaction');
    if (err.response?.data) {
      log.error(JSON.stringify(err.response.data, null, 2));
    } else {
      log.error(err.message);
    }
    process.exit(1);
  }

  log.success('Transaction initialized successfully');
  log.info(`Reference:          ${initResult.reference}`);
  log.info(`Access Code:        ${initResult.accessCode}`);
  log.info(`Authorization URL:  ${initResult.authorizationUrl}`);

  log.divider();
  log.info('👉 Open the Authorization URL in your browser to complete the test payment.');
  log.info('   Use Paystack test card: 4084084084084081 | CVV: 408 | Expiry: 12/25 | PIN: 4080');
  log.divider();

  // 3. Wait for user to complete payment, then offer to verify
  // We can't block stdin in a simple script, so we just verify immediately
  // (which will likely show "pending" unless the user is VERY fast).
  // Instead, we verify once and print instructions for manual verification.

  log.info('Running immediate verification (will likely be "pending" if you have not paid yet)...');

  let verifyResult;
  try {
    verifyResult = await verifyTransaction(reference);
  } catch (err) {
    log.error('Failed to verify transaction');
    if (err.response?.data) {
      log.error(JSON.stringify(err.response.data, null, 2));
    } else {
      log.error(err.message);
    }
    process.exit(1);
  }

  log.info(`Verification status: ${verifyResult.status}`);
  if (verifyResult.amount !== undefined) {
    log.info(`Verified amount:     KSh ${verifyResult.amount}`);
  }

  if (verifyResult.status === 'success') {
    log.success('Payment verified successfully!');
  } else if (verifyResult.status === 'pending') {
    log.warn('Payment is still pending.');
    log.info('After completing payment in the browser, run this to verify:');
    log.info(`  curl -H "Authorization: Bearer ${SECRET_KEY}" \\\n       ${BASE_URL}/transaction/verify/${reference}`);
  } else {
    log.error('Payment verification returned: ' + verifyResult.status);
  }

  log.divider();
  log.info('Test complete.');
  log.info('If you need to verify again later, use:');
  log.info(`  curl -H "Authorization: Bearer \${PAYSTACK_SECRET_KEY}" \\\n       ${BASE_URL}/transaction/verify/${reference}`);
  log.divider();
}

main().catch((err) => {
  log.error('Unexpected error:');
  console.error(err);
  process.exit(1);
});
