const Invoice = require('../models/invoice.model');
const invoiceService = require('../services/invoice.service');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

const fmtDate = d => new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
const REMINDER_DAYS = parseInt(process.env.RENT_REMINDER_DAYS || '3', 10);
const PAYMENT_URL = `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/dashboard/rent`;

/**
 * Generate this month's invoices for all active leases and email the new ones.
 * Idempotent — safe to run more than once a month.
 */
const runMonthlyBilling = async (refDate = new Date()) => {
  const result = await invoiceService.generateMonthlyInvoices(refDate);
  for (const inv of result.invoices) {
    if (inv.status === 'issued') {
      try {
        await invoiceService.sendInvoiceEmail(inv);
      } catch (err) {
        logger.error(`Invoice email failed for ${inv.invoiceNumber}:`, err);
      }
    }
  }
  return result;
};

/**
 * Daily upkeep: apply late fees to overdue invoices, send pre-due reminders,
 * and send overdue notices. Each notice type is sent at most once per invoice.
 */
const runDailyMaintenance = async (refDate = new Date()) => {
  const lateFees = await invoiceService.applyLateFees(refDate);

  // Pre-due reminders: issued/sent invoices due within REMINDER_DAYS.
  const soon = new Date(refDate);
  soon.setDate(soon.getDate() + REMINDER_DAYS);
  const dueSoon = await Invoice.find({
    status: { $in: ['issued', 'sent'] },
    reminderSentAt: { $exists: false },
    dueDate: { $gte: refDate, $lte: soon }
  }).populate('tenant property');

  let reminders = 0;
  for (const inv of dueSoon) {
    if (!inv.tenant?.email) continue;
    try {
      await emailService.sendEmail(
        inv.tenant.email,
        'Rent Payment Reminder - NyumbaSync',
        'rent-reminder',
        {
          firstName: inv.tenant.firstName || 'Tenant',
          amount: Number(inv.total || 0).toLocaleString('en-KE'),
          dueDate: fmtDate(inv.dueDate),
          propertyAddress: inv.property?.title || inv.property?.address || 'your property',
          paymentUrl: PAYMENT_URL
        }
      );
      inv.reminderSentAt = new Date();
      await inv.save();
      reminders += 1;
    } catch (err) {
      logger.error(`Reminder failed for ${inv.invoiceNumber}:`, err);
    }
  }

  // Overdue notices: overdue invoices not yet notified.
  const overdue = await Invoice.find({
    status: 'overdue',
    overdueNoticeSentAt: { $exists: false }
  }).populate('tenant property');

  let notices = 0;
  for (const inv of overdue) {
    if (!inv.tenant?.email) continue;
    const daysOverdue = Math.max(0, Math.ceil((refDate - new Date(inv.dueDate)) / 86400000));
    try {
      await emailService.sendEmail(
        inv.tenant.email,
        'Rent Payment Overdue - NyumbaSync',
        'rent-overdue',
        {
          firstName: inv.tenant.firstName || 'Tenant',
          amount: Number(inv.subtotal || 0).toLocaleString('en-KE'),
          dueDate: fmtDate(inv.dueDate),
          daysOverdue,
          lateFee: inv.lateFee ? Number(inv.lateFee).toLocaleString('en-KE') : null,
          totalAmount: Number(inv.total || 0).toLocaleString('en-KE'),
          paymentUrl: PAYMENT_URL
        }
      );
      inv.overdueNoticeSentAt = new Date();
      await inv.save();
      notices += 1;
    } catch (err) {
      logger.error(`Overdue notice failed for ${inv.invoiceNumber}:`, err);
    }
  }

  logger.info(`Daily billing: ${lateFees.penalized} late-fee, ${reminders} reminder(s), ${notices} overdue notice(s)`);
  return { ...lateFees, reminders, notices };
};

/**
 * Register cron jobs. Disabled when ENABLE_SCHEDULER=false (tests/CI) or when
 * node-cron is unavailable. Safe to call once at boot.
 */
const start = () => {
  if (process.env.ENABLE_SCHEDULER === 'false') {
    logger.info('Billing scheduler disabled (ENABLE_SCHEDULER=false)');
    return;
  }

  let cron;
  try {
    cron = require('node-cron');
  } catch (err) {
    logger.warn('node-cron not installed — billing scheduler not started');
    return;
  }

  // 06:00 on the 1st of every month — generate + email invoices.
  cron.schedule('0 6 1 * *', () => {
    runMonthlyBilling().catch(err => logger.error('Monthly billing job failed:', err));
  });

  // 07:00 daily — late fees, reminders, overdue notices.
  cron.schedule('0 7 * * *', () => {
    runDailyMaintenance().catch(err => logger.error('Daily billing job failed:', err));
  });

  logger.info('Billing scheduler started (monthly invoicing + daily reminders)');
};

module.exports = { start, runMonthlyBilling, runDailyMaintenance };
