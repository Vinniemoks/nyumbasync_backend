#!/usr/bin/env node
/**
 * Zoho Mail SMTP Test Script for NyumbaSync
 *
 * Usage:
 *   node scripts/test-zoho-smtp.js
 *   node scripts/test-zoho-smtp.js [recipient@email.com]
 *
 * This script reads SMTP_USER and SMTP_PASS from the .env file
 * and sends a test email via Zoho Mail. It will NOT send anything
 * if credentials are missing, so it is safe to run in any environment.
 */

const path = require('path');

// Load environment variables from the backend .env file
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const nodemailer = require('nodemailer');

// ─── Configuration ──────────────────────────────────────────────────────────
const HOST         = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.zoho.com';
const PORT         = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
const USER         = process.env.SMTP_USER || process.env.EMAIL_USER;
const PASS         = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
const FROM         = process.env.SMTP_FROM || process.env.EMAIL_FROM || USER;
const RECIPIENT    = process.argv[2] || USER; // default: send to yourself

// ─── Safety check ───────────────────────────────────────────────────────────
if (!USER || !PASS) {
  console.error('\n❌  SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASSWORD is not set.');
  console.error('    Please add them to nyumbasync_backend/.env or fly secrets and try again.\n');
  console.error('    Example:');
  console.error('      SMTP_USER=support@nyumbasync.com');
  console.error('      SMTP_PASS=your-zoho-app-specific-password\n');
  process.exit(1);
}

// ─── Initialize transporter ─────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: PORT === 465,
  auth: { user: USER, pass: PASS },
  tls: { rejectUnauthorized: true },
});

// ─── Verify connection ──────────────────────────────────────────────────────
console.log('\n📧  Zoho Mail SMTP Test');
console.log('   ───────────────────────────');
console.log(`   Host:    ${HOST}:${PORT}`);
console.log(`   User:    ${USER}`);
console.log(`   From:    ${FROM}`);
console.log(`   To:      ${RECIPIENT}`);
console.log('   ───────────────────────────\n');

(async () => {
  try {
    console.log('🔌  Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅  SMTP connection verified.\n');

    const info = await transporter.sendMail({
      from: `"NyumbaSync" <${FROM}>`,
      to: RECIPIENT,
      subject: 'NyumbaSync — Zoho Mail Test',
      text: `Hello from NyumbaSync!\n\nIf you received this email, your Zoho Mail SMTP is configured correctly.\n\nSent at: ${new Date().toISOString()}\nEnvironment: ${process.env.NODE_ENV || 'development'}\n`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4caf50;">✅ Zoho Mail is Working!</h2>
          <p>Hello from <strong>NyumbaSync</strong>,</p>
          <p>If you are reading this, transactional email via Zoho Mail SMTP is configured correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 14px;">
            <strong>Sent at:</strong> ${new Date().toISOString()}<br />
            <strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}<br />
            <strong>From:</strong> ${FROM}<br />
            <strong>To:</strong> ${RECIPIENT}
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
            This is an automated test message. Please ignore it.
          </p>
        </div>
      `,
    });

    console.log('🎉  Email sent successfully!');
    console.log(`    Message ID: ${info.messageId}`);
    console.log(`    Accepted:   ${info.accepted.join(', ')}`);
    console.log(`    Response:   ${info.response}\n`);
  } catch (error) {
    console.error('\n❌  Failed to send test email.\n');
    console.error(`   Error: ${error.message}\n`);
    console.error('   Common fixes:');
    console.error('   • Use an app-specific password, not your Zoho account password.');
    console.error('   • Go to Zoho Mail → Settings → Security → App Passwords → Generate.');
    console.error('   • Ensure your Zoho account allows IMAP/POP access.');
    console.error('   • Check that SMTP_USER is the full email address.');
    console.error('   • For port 587: SMTP_SECURE should be empty or "false" (STARTTLS).');
    console.error('   • For port 465: SMTP_SECURE should be "true" (SSL/TLS).\n');
    process.exit(1);
  }
})();
