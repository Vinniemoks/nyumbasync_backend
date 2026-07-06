const nodemailer = require('nodemailer');
const logger = require('../config/logger');

/**
 * SMTP Email Transport — Zoho Mail, Gmail, or any SMTP provider.
 *
 * Environment variables (SMTP_* names take precedence; EMAIL_* names are
 * used as fallbacks because that is what the rest of the NyumbaSync backend
 * already expects):
 *   SMTP_HOST / EMAIL_HOST       (default: smtp.zoho.com)
 *   SMTP_PORT / EMAIL_PORT       (default: 587)
 *   SMTP_SECURE / EMAIL_SECURE   (default: false → STARTTLS on 587, true for SSL on 465)
 *   SMTP_USER / EMAIL_USER       (your full email, e.g. support@nyumbasync.co.ke)
 *   SMTP_PASS / EMAIL_PASSWORD   (app-specific password, NOT your account password)
 *   SMTP_FROM / EMAIL_FROM       (default: SMTP_USER / EMAIL_USER)
 */

class SmtpEmailService {
  constructor() {
    // Accept either SMTP_* or EMAIL_* environment variables. The EMAIL_*
    // names are what the rest of the NyumbaSync backend already uses.
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.zoho.com';
    const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

    if (!user || !pass) {
      this.transporter = null;
      logger.warn('⚠️ SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASSWORD not set — SMTP email disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // Zoho-specific: some servers need this
      tls: { rejectUnauthorized: true },
    });

    this.from = process.env.SMTP_FROM || process.env.EMAIL_FROM || user;
    logger.info(`✅ SMTP transport ready (${host}:${port})`);
  }

  isReady() {
    return !!this.transporter;
  }

  async send({ to, subject, html, text, attachments }) {
    if (!this.transporter) {
      logger.warn('SMTP not configured — email not sent');
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"NyumbaSync" <${this.from}>`,
        to,
        subject,
        text: text || this.stripHtml(html),
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'application/pdf',
        })),
      });

      logger.info(`✅ Email sent to ${to}: ${subject} [${info.messageId}]`);
      return true;
    } catch (error) {
      logger.error('❌ SMTP send failed:', error.message);
      return false;
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = new SmtpEmailService();
