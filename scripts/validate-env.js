#!/usr/bin/env node
/**
 * Environment variable validation script for NyumbaSync backend.
 * Run this before starting the server in production to catch missing secrets.
 *
 * Usage:
 *   node scripts/validate-env.js
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = critical errors found
 *   2 = warnings only (non-critical)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const PLACEHOLDER_PATTERNS = [
  /^generate_a_random_string/,
  /^change_me/,
  /^your_/,
  /^placeholder/,
  /^example/,
  /^(sk-|SG\.).*example/,
  /^<.*>$/,
];

const isPlaceholder = (value) => {
  if (!value || value.trim() === '') return true;
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed.toLowerCase()));
};

const checks = [];

const addCheck = (label, value, required, feature = 'general') => {
  const status = isPlaceholder(value) ? (required ? 'error' : 'warning') : 'ok';
  checks.push({ label, status, value, required, feature });
};

// --- Critical checks ---
addCheck('NODE_ENV', process.env.NODE_ENV, true);
addCheck('PORT', process.env.PORT, true);
addCheck('MONGODB_URI', process.env.MONGODB_URI, true);
addCheck('JWT_SECRET', process.env.JWT_SECRET, true, 'auth');
addCheck('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN, true, 'auth');
addCheck('JWT_REFRESH_EXPIRES_IN', process.env.JWT_REFRESH_EXPIRES_IN, true, 'auth');

// --- Auth (refresh token) ---
addCheck('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, false, 'auth');

// --- CORS ---
addCheck('CORS_ORIGIN', process.env.CORS_ORIGIN, false, 'cors');
addCheck('ALLOWED_ORIGINS', process.env.ALLOWED_ORIGINS, false, 'cors');
addCheck('CLIENT_URL', process.env.CLIENT_URL, false, 'cors');

// --- Email ---
addCheck('SENDGRID_API_KEY', process.env.SENDGRID_API_KEY, false, 'email');
addCheck('EMAIL_FROM', process.env.EMAIL_FROM, false, 'email');

// --- M-Pesa ---
addCheck('MPESA_CONSUMER_KEY', process.env.MPESA_CONSUMER_KEY, false, 'mpesa');
addCheck('MPESA_CONSUMER_SECRET', process.env.MPESA_CONSUMER_SECRET, false, 'mpesa');
addCheck('MPESA_SHORTCODE', process.env.MPESA_SHORTCODE, false, 'mpesa');
addCheck('MPESA_PASSKEY', process.env.MPESA_PASSKEY, false, 'mpesa');
addCheck('MPESA_CALLBACK_URL', process.env.MPESA_CALLBACK_URL, false, 'mpesa');

// --- Card payments ---
addCheck('PAYSTACK_SECRET_KEY', process.env.PAYSTACK_SECRET_KEY, false, 'paystack');
addCheck('PAYSTACK_PUBLIC_KEY', process.env.PAYSTACK_PUBLIC_KEY, false, 'paystack');
addCheck('CARD_RETURN_URL', process.env.CARD_RETURN_URL, false, 'paystack');

// --- Bank transfer ---
addCheck('BANK_NAME', process.env.BANK_NAME, false, 'bank');
addCheck('BANK_ACCOUNT_NAME', process.env.BANK_ACCOUNT_NAME, false, 'bank');
addCheck('BANK_ACCOUNT_NUMBER', process.env.BANK_ACCOUNT_NUMBER, false, 'bank');

// --- SMS ---
addCheck('TWILIO_ACCOUNT_SID', process.env.TWILIO_ACCOUNT_SID, false, 'sms');
addCheck('TWILIO_AUTH_TOKEN', process.env.TWILIO_AUTH_TOKEN, false, 'sms');
addCheck('TWILIO_PHONE_NUMBER', process.env.TWILIO_PHONE_NUMBER, false, 'sms');
addCheck('AT_USERNAME', process.env.AT_USERNAME, false, 'sms');
addCheck('AT_API_KEY', process.env.AT_API_KEY, false, 'sms');

// --- Optional ---
addCheck('REDIS_URL', process.env.REDIS_URL, false, 'cache');
addCheck('SENTRY_DSN', process.env.SENTRY_DSN, false, 'monitoring');

// --- Print results ---
const errors = checks.filter((c) => c.status === 'error');
const warnings = checks.filter((c) => c.status === 'warning');
const ok = checks.filter((c) => c.status === 'ok');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           NyumbaSync Environment Validation                ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

if (ok.length) {
  console.log(`✅  ${ok.length} check(s) passed\n`);
}

if (warnings.length) {
  console.log(`⚠️   ${warnings.length} warning(s) — optional features may be disabled:\n`);
  warnings.forEach((c) => {
    console.log(`   [${c.feature}] ${c.label}: ${c.value || '(empty)'}`);
  });
  console.log('');
}

if (errors.length) {
  console.log(`❌  ${errors.length} error(s) — these must be fixed before production:\n`);
  errors.forEach((c) => {
    console.log(`   [${c.feature}] ${c.label}: ${c.value || '(empty)'}`);
  });
  console.log('\n👉  Generate a strong JWT_SECRET with:\n');
  console.log('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  console.log('👉  Then update your .env file and re-run this script.\n');
  process.exit(1);
}

console.log('🚀  All environment checks passed. Ready to start!\n');
process.exit(0);
