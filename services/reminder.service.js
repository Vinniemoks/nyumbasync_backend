const smsService = require('./sms.service');
const emailService = require('./email.service');
const logger = require('../utils/logger');

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
const fmtKES = n => `KES ${Number(n || 0).toLocaleString('en-KE')}`;

const SUPPORTED = ['sms', 'whatsapp', 'email'];

/**
 * Send a rent-due reminder for an invoice across the chosen channels. Each
 * channel is best-effort; returns a per-channel result map so the caller can
 * report exactly what went out.
 * @param {Object} invoice - populated with `tenant` (firstName/email/phone) and `property`
 * @param {string[]} channels - any of 'sms' | 'whatsapp' | 'email'
 */
const sendInvoiceReminder = async (invoice, channels = ['sms']) => {
  const tenant = invoice.tenant || {};
  const due = invoice.balance != null ? invoice.balance : invoice.total;
  const propertyName = invoice.property?.title || invoice.property?.address || 'your property';
  const paymentUrl = `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/dashboard/rent`;
  const shortMsg =
    `NyumbaSync: Hi ${tenant.firstName || 'there'}, your rent invoice ${invoice.invoiceNumber} ` +
    `of ${fmtKES(due)} for ${propertyName} is due ${fmtDate(invoice.dueDate)}. Pay: ${paymentUrl}`;

  const wanted = channels.filter(c => SUPPORTED.includes(c));
  const results = {};

  await Promise.all(wanted.map(async (channel) => {
    try {
      if (channel === 'email') {
        if (!tenant.email) { results.email = { success: false, message: 'No email on file' }; return; }
        results.email = await emailService.sendEmail(
          tenant.email,
          `Rent Reminder — Invoice ${invoice.invoiceNumber}`,
          'rent-reminder',
          {
            firstName: tenant.firstName || 'Tenant',
            amount: Number(due || 0).toLocaleString('en-KE'),
            dueDate: fmtDate(invoice.dueDate),
            propertyAddress: propertyName,
            paymentUrl
          }
        );
      } else if (channel === 'sms') {
        if (!tenant.phone) { results.sms = { success: false, message: 'No phone on file' }; return; }
        results.sms = await smsService.sendSMS(tenant.phone, shortMsg);
      } else if (channel === 'whatsapp') {
        if (!tenant.phone) { results.whatsapp = { success: false, message: 'No phone on file' }; return; }
        results.whatsapp = await smsService.sendWhatsApp(tenant.phone, shortMsg);
      }
    } catch (err) {
      logger.error(`Reminder ${channel} failed for ${invoice.invoiceNumber}:`, err.message);
      results[channel] = { success: false, message: err.message };
    }
  }));

  return results;
};

module.exports = { sendInvoiceReminder, SUPPORTED };
