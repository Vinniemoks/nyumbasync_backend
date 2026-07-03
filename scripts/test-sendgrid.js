#!/usr/bin/env node
/**
 * SendGrid Test Script for NyumbaSync
 *
 * Usage:
 *   node scripts/test-sendgrid.js
 *   node scripts/test-sendgrid.js [recipient@email.com]
 *
 * This script reads SENDGRID_API_KEY and EMAIL_FROM from the .env file in the
 * parent directory and sends a test email. It will NOT send anything if the key
 * is missing, so it is safe to run in any environment.
 */

const path = require('path');

// Load environment variables from the backend .env file (one level up from scripts/)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const sgMail = require('@sendgrid/mail');

// ─── Configuration ──────────────────────────────────────────────────────────
const API_KEY        = process.env.SENDGRID_API_KEY;
const FROM_EMAIL     = process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || 'support@nyumbasync.com';
const RECIPIENT      = process.argv[2] || 'test@nyumbasync.com';

// ─── Safety check ───────────────────────────────────────────────────────────
if (!API_KEY) {
  console.error('\n❌  SENDGRID_API_KEY is not set.');
  console.error('    Please add it to nyumbasync_backend/.env and try again.\n');
  console.error('    Example:');
  console.error('      SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n');
  process.exit(1);
}

if (!API_KEY.startsWith('SG.')) {
  console.error('\n⚠️  Warning: SENDGRID_API_KEY does not start with "SG.".');
  console.error('    Make sure you copied the full API key from SendGrid.\n');
  process.exit(1);
}

// ─── Initialize SendGrid ────────────────────────────────────────────────────
sgMail.setApiKey(API_KEY);

// ─── Build test message ─────────────────────────────────────────────────────
const testMsg = {
  to:   RECIPIENT,
  from: {
    email: FROM_EMAIL,
    name:  'NyumbaSync',
  },
  subject: 'NyumbaSync — SendGrid Test',
  text: 'Hello from NyumbaSync!\n\n' +
        'If you received this email, your SendGrid integration is working correctly.\n\n' +
        `Sent at: ${new Date().toISOString()}\n` +
        `Environment: ${process.env.NODE_ENV || 'development'}\n`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #6366f1;">✅ SendGrid is Working!</h2>
      <p>Hello from <strong>NyumbaSync</strong>,</p>
      <p>If you are reading this, transactional email via SendGrid is configured correctly.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #6b7280; font-size: 14px;">
        <strong>Sent at:</strong> ${new Date().toISOString()}<br />
        <strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}<br />
        <strong>From:</strong> ${FROM_EMAIL}<br />
        <strong>To:</strong> ${RECIPIENT}
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
        This is an automated test message. Please ignore it.
      </p>
    </div>
  `,
};

// ─── Send ─────────────────────────────────────────────────────────────────────
console.log('\n📧  SendGrid Test Email');
console.log('   ───────────────────────────');
console.log(`   From:    ${FROM_EMAIL}`);
console.log(`   To:      ${RECIPIENT}`);
console.log(`   Subject: ${testMsg.subject}`);
console.log('   ───────────────────────────\n');

(async () => {
  try {
    const [response] = await sgMail.send(testMsg);

    // 202 Accepted = success
    if (response.statusCode === 202) {
      console.log('🎉  Email sent successfully!');
      console.log(`    Status:  ${response.statusCode} Accepted`);
      console.log(`    Headers: ${JSON.stringify(response.headers, null, 2)}\n`);
    } else {
      console.log(`⚠️  Unexpected status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('\n❌  Failed to send test email.\n');

    if (error.response) {
      // SendGrid returned an error response
      console.error('   SendGrid Error:');
      console.error(`   Status:  ${error.response.statusCode || 'N/A'}`);
      console.error(`   Body:    ${JSON.stringify(error.response.body, null, 2)}`);
    } else if (error.code) {
      // Network / connection error
      console.error(`   Network Error (${error.code}): ${error.message}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }

    console.error('');
    console.error('   Common fixes:');
    console.error('   • Verify your Single Sender (support@nyumbasync.com) in SendGrid.');
    console.error('   • Ensure SENDGRID_API_KEY is correct and starts with "SG.".');
    console.error('   • Check that your SendGrid account is active (not suspended).\n');

    process.exit(1);
  }
})();
