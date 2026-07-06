const sgMail = require('@sendgrid/mail');
const smtp = require('./smtpEmailService');
const logger = require('../config/logger');

/**
 * Unified Email Service.
 *
 * Sends via SMTP (Zoho Mail, Gmail, etc.) when configured.
 * Falls back to SendGrid when SMTP is unavailable but SendGrid is.
 * Logs a warning and returns false if neither is configured.
 *
 * Priority:
 *   1. SMTP (SMTP_USER + SMTP_PASS set)
 *   2. SendGrid (SENDGRID_API_KEY set)
 *   3. Disabled (log warning)
 */
class EmailService {
  constructor() {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      logger.info('✅ SendGrid initialized');
    }
  }

  getTransport() {
    if (smtp.isReady()) return 'smtp';
    if (process.env.SENDGRID_API_KEY) return 'sendgrid';
    return null;
  }

  /**
   * Send an email using the best available transport.
   * @param {Object} options
   * @param {string|string[]} options.to
   * @param {string} options.subject
   * @param {string} options.html
   * @param {string} [options.text]
   * @param {Array} [options.attachments]
   * @param {string} [options.from] - Optional sender override. Defaults to the
   *   configured SMTP user or SendGrid from address.
   */
  async sendEmail({ to, subject, html, text, attachments, from }) {
    const transport = this.getTransport();

    if (!transport) {
      logger.warn('Email not sent — no email provider configured (SMTP or SendGrid)');
      return false;
    }

    if (transport === 'smtp') {
      return smtp.send({ to, subject, html, text, attachments, from });
    }

    // SendGrid path
    try {
      const msg = {
        to,
        from: from || process.env.SENDGRID_FROM_EMAIL || 'noreply@nyumbasync.com',
        subject,
        text: text || this.stripHtml(html),
        html,
      };

      if (Array.isArray(attachments) && attachments.length) {
        msg.attachments = attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : Buffer.from(a.content).toString('base64'),
          type: a.contentType || 'application/pdf',
          disposition: 'attachment',
        }));
      }

      await sgMail.send(msg);
      logger.info(`✅ Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error('❌ Error sending email:', error);
      if (error.response) {
        logger.error(error.response.body);
      }
      return false;
    }
  }

  // ─── Template wrappers (unchanged) ────────────────────────────────────────

  async sendPaymentConfirmation(payment, user) {
    const subject = `Payment Confirmation - KES ${payment.amount.toLocaleString()}`;
    const html = this.getPaymentConfirmationTemplate({
      userName: user.name,
      amount: payment.amount,
      transactionId: payment.transactionId || payment._id,
      paymentDate: new Date(payment.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      paymentMethod: payment.method || 'M-Pesa',
      propertyName: payment.property?.name || 'Property',
      receiptNumber: payment.receiptNumber || `RCP-${payment._id.toString().slice(-8)}`,
    });
    return this.sendEmail({ to: user.email, subject, html });
  }

  async sendPaymentReminder(lease, tenant, daysOverdue = 0) {
    const subject = daysOverdue > 0
      ? `Payment Overdue - ${daysOverdue} Days`
      : 'Upcoming Rent Payment Reminder';
    const html = this.getPaymentReminderTemplate({
      tenantName: tenant.name,
      amount: lease.rent,
      dueDate: new Date(lease.nextPaymentDate || lease.endDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      propertyName: lease.property?.name || 'Property',
      daysOverdue,
      isOverdue: daysOverdue > 0,
    });
    return this.sendEmail({ to: tenant.email, subject, html });
  }

  async sendPaymentReceipt(payment, user, pdfUrl = null) {
    const subject = `Payment Receipt - ${payment.receiptNumber || 'N/A'}`;
    const html = this.getPaymentReceiptTemplate({
      userName: user.name,
      amount: payment.amount,
      transactionId: payment.transactionId || payment._id,
      receiptNumber: payment.receiptNumber || `RCP-${payment._id.toString().slice(-8)}`,
      paymentDate: new Date(payment.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      paymentMethod: payment.method || 'M-Pesa',
      propertyName: payment.property?.name || 'Property',
      pdfUrl,
    });
    return this.sendEmail({ to: user.email, subject, html });
  }

  async sendMaintenanceUpdate(maintenance, user, updateType = 'updated') {
    const subjectMap = {
      created: 'New Maintenance Request Submitted',
      updated: 'Maintenance Request Update',
      completed: 'Maintenance Request Completed',
      assigned: 'Maintenance Request Assigned to You',
    };
    const subject = subjectMap[updateType] || 'Maintenance Request Update';
    const html = this.getMaintenanceUpdateTemplate({
      userName: user.name,
      requestId: maintenance._id.toString().slice(-8).toUpperCase(),
      title: maintenance.title || 'Maintenance Request',
      description: maintenance.description,
      status: maintenance.status,
      priority: maintenance.priority || 'Normal',
      propertyName: maintenance.property?.name || 'Property',
      updateType,
      createdDate: new Date(maintenance.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
    });
    return this.sendEmail({ to: user.email, subject, html });
  }

  async sendLeaseExpiryWarning(lease, tenant, daysRemaining) {
    const subject = `Lease Expiry Notice - ${daysRemaining} Days Remaining`;
    const html = this.getLeaseExpiryTemplate({
      tenantName: tenant.name,
      propertyName: lease.property?.name || 'Property',
      expiryDate: new Date(lease.endDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      daysRemaining,
      monthlyRent: lease.rent,
    });
    return this.sendEmail({ to: tenant.email, subject, html });
  }

  async sendWelcomeEmail(user, userType = 'tenant') {
    const html = this.getWelcomeEmailTemplate({
      userName: user.name,
      userEmail: user.email,
      userType,
    });
    return this.sendEmail({ to: user.email, subject: 'Welcome to NyumbaSync!', html });
  }

  // ─── Templates (unchanged) ────────────────────────────────────────────────

  getPaymentConfirmationTemplate(data) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Payment Confirmation</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Payment Confirmed</h1><p style="color:#e0e7ff;margin:10px 0 0;font-size:16px;">Thank you for your payment</p></td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">Dear ${data.userName},</p><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">We have successfully received your payment. Here are the details:</p><table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:30px;"><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Amount Paid</td><td align="right" style="color:#10b981;font-size:18px;font-weight:bold;border-bottom:1px solid #e5e7eb;">KES ${data.amount.toLocaleString()}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Receipt Number</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.receiptNumber}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Transaction ID</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.transactionId}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Payment Date</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.paymentDate}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Payment Method</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.paymentMethod}</td></tr><tr><td style="color:#6b7280;font-size:14px;">Property</td><td align="right" style="color:#111827;font-size:14px;">${data.propertyName}</td></tr></table><p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 10px;">If you have any questions about this payment, please don't hesitate to contact us.</p><p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">Best regards,<br><strong>NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">This is an automated email. Please do not reply to this message.</p><p style="color:#6b7280;font-size:12px;margin:10px 0 0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  getPaymentReminderTemplate(data) {
    const urgencyColor = data.isOverdue ? '#ef4444' : '#f59e0b';
    const urgencyText = data.isOverdue ? 'Overdue Payment' : 'Upcoming Payment';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Payment Reminder</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr><td style="background-color:${urgencyColor};padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">${urgencyText}</h1>${data.isOverdue ? `<p style="color:#fff;margin:10px 0 0;font-size:16px;">${data.daysOverdue} days overdue</p>` : `<p style="color:#fff;margin:10px 0 0;font-size:16px;">Payment due soon</p>`}</td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">Dear ${data.tenantName},</p><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">${data.isOverdue ? `Your rent payment is <strong style="color:${urgencyColor};">${data.daysOverdue} days overdue</strong>. Please make your payment as soon as possible to avoid late fees.` : 'This is a friendly reminder that your rent payment is due soon.'}</p><table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:30px;"><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Amount Due</td><td align="right" style="color:${urgencyColor};font-size:18px;font-weight:bold;border-bottom:1px solid #e5e7eb;">KES ${data.amount.toLocaleString()}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Due Date</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.dueDate}</td></tr><tr><td style="color:#6b7280;font-size:14px;">Property</td><td align="right" style="color:#111827;font-size:14px;">${data.propertyName}</td></tr></table><p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;">Please make your payment through M-Pesa or contact us for alternative payment methods.</p><p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">Best regards,<br><strong>NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">This is an automated reminder. Please contact us if you have any questions.</p><p style="color:#6b7280;font-size:12px;margin:10px 0 0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  getPaymentReceiptTemplate(data) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Payment Receipt</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Payment Receipt</h1><p style="color:#d1fae5;margin:10px 0 0;font-size:16px;">Official receipt for your records</p></td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">Dear ${data.userName},</p><table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:30px;"><tr><td colspan="2" style="color:#111827;font-size:16px;font-weight:bold;border-bottom:2px solid #10b981;padding-bottom:12px;">Receipt #${data.receiptNumber}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;padding-top:12px;">Amount Paid</td><td align="right" style="color:#10b981;font-size:18px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-top:12px;">KES ${data.amount.toLocaleString()}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Transaction ID</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.transactionId}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Payment Date</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.paymentDate}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Payment Method</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.paymentMethod}</td></tr><tr><td style="color:#6b7280;font-size:14px;">Property</td><td align="right" style="color:#111827;font-size:14px;">${data.propertyName}</td></tr></table>${data.pdfUrl ? `<div style="text-align:center;margin:30px 0;"><a href="${data.pdfUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold;">Download PDF Receipt</a></div>` : ''}<p style="color:#374151;font-size:14px;line-height:1.6;margin:20px 0 0;">Thank you for your payment. Keep this receipt for your records.</p><p style="color:#374151;font-size:14px;line-height:1.6;margin:20px 0 0;">Best regards,<br><strong>NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">This is an official receipt. Please keep it for your records.</p><p style="color:#6b7280;font-size:12px;margin:10px 0 0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  getMaintenanceUpdateTemplate(data) {
    const statusColors = { pending: '#f59e0b', 'in-progress': '#3b82f6', completed: '#10b981', cancelled: '#6b7280' };
    const priorityColors = { low: '#10b981', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Maintenance Update</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Maintenance Update</h1><p style="color:#dbeafe;margin:10px 0 0;">Request #${data.requestId}</p></td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:16px;margin:0 0 20px;">Dear ${data.userName},</p><p style="color:#374151;font-size:16px;margin:0 0 30px;">Your maintenance request has been ${data.updateType}.</p><table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:30px;"><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Title</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;font-weight:600;">${data.title}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Status</td><td align="right" style="border-bottom:1px solid #e5e7eb;"><span style="display:inline-block;padding:4px 12px;background-color:${statusColors[data.status] || '#6b7280'};color:white;border-radius:12px;font-size:12px;font-weight:600;text-transform:capitalize;">${data.status}</span></td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Priority</td><td align="right" style="border-bottom:1px solid #e5e7eb;"><span style="display:inline-block;padding:4px 12px;background-color:${priorityColors[data.priority?.toLowerCase()] || '#3b82f6'};color:white;border-radius:12px;font-size:12px;font-weight:600;text-transform:capitalize;">${data.priority}</span></td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Property</td><td align="right" style="color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${data.propertyName}</td></tr><tr><td style="color:#6b7280;font-size:14px;">Created</td><td align="right" style="color:#111827;font-size:14px;">${data.createdDate}</td></tr></table>${data.description ? `<div style="background:#f9fafb;padding:16px;border-radius:6px;margin-bottom:20px;"><strong style="color:#111827;">Description:</strong><p style="color:#6b7280;margin:8px 0 0;">${data.description}</p></div>` : ''}<p style="color:#374151;font-size:14px;margin:0;">Best regards,<br><strong>NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  getLeaseExpiryTemplate(data) {
    const urgencyColor = data.daysRemaining <= 30 ? '#ef4444' : '#f59e0b';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lease Expiry Notice</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background-color:${urgencyColor};padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Lease Expiry Notice</h1><p style="color:#fff;margin:10px 0 0;font-size:18px;font-weight:600;">${data.daysRemaining} Days Remaining</p></td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:16px;margin:0 0 20px;">Dear ${data.tenantName},</p><p style="color:#374151;font-size:16px;margin:0 0 30px;">This is a reminder that your lease agreement will expire soon. Please review the details below:</p><table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:30px;"><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Property</td><td align="right" style="color:#111827;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;">${data.propertyName}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Lease Expiry Date</td><td align="right" style="color:${urgencyColor};font-size:16px;font-weight:700;border-bottom:1px solid #e5e7eb;">${data.expiryDate}</td></tr><tr><td style="color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">Days Remaining</td><td align="right" style="color:${urgencyColor};font-size:18px;font-weight:700;border-bottom:1px solid #e5e7eb;">${data.daysRemaining} days</td></tr><tr><td style="color:#6b7280;font-size:14px;">Monthly Rent</td><td align="right" style="color:#111827;font-size:14px;">KES ${data.monthlyRent.toLocaleString()}</td></tr></table><div style="background-color:${data.daysRemaining <= 30 ? '#fee2e2' : '#fef3c7'};padding:16px;border-radius:6px;border-left:4px solid ${urgencyColor};margin-bottom:20px;"><p style="color:#374151;font-size:14px;margin:0;font-weight:600;">⚠️ Action Required</p><p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Please contact your landlord to discuss lease renewal or move-out arrangements.</p></div><p style="color:#374151;font-size:14px;margin:0;">Best regards,<br><strong>NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  getPasswordResetTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your NyumbaSync password</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:linear-gradient(135deg,#15803d 0%,#166534 100%);padding:40px 30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Reset your password</h1>
              <p style="color:#dcfce7;margin:10px 0 0;font-size:16px;">NyumbaSync Account Security</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">Hi ${data.userName || data.userEmail},</p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">We received a request to reset the password for your NyumbaSync account. Tap the button below to choose a new password. This link expires in <strong>10 minutes</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;">
                <tr>
                  <td align="center">
                    <a href="${data.resetUrl}" style="display:inline-block;padding:14px 32px;background:#15803d;color:#ffffff;font-size:16px;font-weight:600;border-radius:8px;text-decoration:none;">Reset my password</a>
                  </td>
                </tr>
              </table>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="background:#f0fdf4;padding:12px;border-radius:6px;word-break:break-all;margin:0 0 30px;font-size:13px;color:#166534;">${data.resetUrl}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />
              <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;"><strong>Didn't request this?</strong> If you did not ask for a password reset, <a href="${data.loginUrl}" style="color:#15803d;text-decoration:underline;font-weight:600;">log in to your account</a> and change your password immediately to keep your account secure.</p>
              <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:30px 0 0;">From the NyumbaSync team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  getWelcomeEmailTemplate(data) {
    const features = data.userType === 'landlord'
      ? [
        { icon: '🏠', title: 'Manage Properties', desc: 'Add and manage multiple properties in one place' },
        { icon: '💰', title: 'Track Payments', desc: 'Receive rent payments via M-Pesa with automatic tracking' },
        { icon: '📊', title: 'Financial Reports', desc: 'Get detailed insights into your property performance' },
        { icon: '🔧', title: 'Maintenance Requests', desc: 'Handle tenant requests efficiently' }
      ]
      : [
        { icon: '💳', title: 'Easy Payments', desc: 'Pay rent securely via M-Pesa' },
        { icon: '🔔', title: 'Get Notified', desc: 'Never miss a payment with reminders' },
        { icon: '🔧', title: 'Submit Requests', desc: 'Report maintenance issues instantly' },
        { icon: '💬', title: 'Direct Messaging', desc: 'Communicate with your landlord easily' }
      ];
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to NyumbaSync</title></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:50px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:32px;">Welcome to NyumbaSync!</h1><p style="color:#e0e7ff;margin:15px 0 0;font-size:18px;">Your Property Management Journey Starts Here</p></td></tr><tr><td style="padding:40px 30px;"><p style="color:#374151;font-size:18px;margin:0 0 10px;font-weight:600;">Hi ${data.userName}!</p><p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">We're excited to have you join NyumbaSync, Kenya's leading property management platform. You're all set to manage your ${data.userType === 'landlord' ? 'properties' : 'rental experience'} with ease.</p><h2 style="color:#111827;font-size:20px;margin:0 0 20px;">🚀 What You Can Do:</h2>${features.map(f => `<div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:12px;border-left:4px solid #6366f1;"><div style="display:flex;align-items:flex-start;"><span style="font-size:24px;margin-right:12px;">${f.icon}</span><div><h3 style="color:#111827;font-size:16px;margin:0 0 4px;">${f.title}</h3><p style="color:#6b7280;font-size:14px;margin:0;">${f.desc}</p></div></div></div>`).join('')}<div style="background:#ede9fe;padding:20px;border-radius:8px;margin:30px 0;text-align:center;"><p style="color:#5b21b6;font-size:14px;font-weight:600;margin:0 0 8px;">YOUR ACCOUNT EMAIL</p><p style="color:#6366f1;font-size:16px;font-weight:700;margin:0;">${data.userEmail}</p></div><p style="color:#374151;font-size:14px;line-height:1.6;margin:20px 0 0;">If you have any questions, our support team is here to help!</p><p style="color:#374151;font-size:14px;margin:20px 0 0;">Best regards,<br><strong>The NyumbaSync Team</strong></p></td></tr><tr><td style="background:#f9fafb;padding:25px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:13px;margin:0 0 10px;">Need help? Contact us at support@nyumbasync.com</p><p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = new EmailService();
