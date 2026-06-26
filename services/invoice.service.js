const PDFDocument = require('pdfkit');
const Invoice = require('../models/invoice.model');
const Lease = require('../models/lease.model');
const emailService = require('./email.service');
const logger = require('../utils/logger');

const KES = n => `KES ${Number(n || 0).toLocaleString('en-KE')}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Generate invoices for every active lease in the billing month containing
 * `refDate`. Idempotent — re-running the same month creates no duplicates.
 * @returns {{ created: number, skipped: number, invoices: Array }}
 */
const generateMonthlyInvoices = async (refDate = new Date(), filter = {}) => {
  const leases = await Lease.find({ status: 'active', ...filter });

  let created = 0;
  let skipped = 0;
  const invoices = [];

  for (const lease of leases) {
    try {
      const { invoice, created: wasCreated } = await Invoice.generateForLease(lease, refDate);
      invoices.push(invoice);
      if (wasCreated) created += 1; else skipped += 1;
    } catch (err) {
      // A unique-index race (two runs at once) surfaces as a duplicate key —
      // treat it as "already exists", not a failure.
      if (err.code === 11000) {
        skipped += 1;
      } else {
        logger.error(`Failed to generate invoice for lease ${lease._id}:`, err);
      }
    }
  }

  logger.info(`Invoice generation: ${created} created, ${skipped} skipped (${leases.length} active leases)`);
  return { created, skipped, invoices };
};

/**
 * Render a branded PDF for an invoice. Resolves to a Buffer suitable for an
 * HTTP download or an email attachment.
 */
const renderInvoicePdf = async (invoice) => {
  // Ensure refs we print are populated (no-op if already populated).
  const populated = invoice.populated && invoice.populated('property')
    ? invoice
    : await Invoice.findById(invoice._id).populate('tenant property landlord');
  const inv = populated || invoice;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const tenant = inv.tenant || {};
      const property = inv.property || {};

      // Header
      doc.fillColor('#3B82F6').fontSize(24).text('NyumbaSync', { continued: false });
      doc.fillColor('#64748B').fontSize(10).text('Smart Property Management for Kenya');
      doc.moveDown(0.5);
      doc.fillColor('#1E293B').fontSize(18).text('RENT INVOICE', { align: 'right' });
      doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).strokeColor('#E2E8F0').stroke();
      doc.moveDown();

      // Meta
      const metaTop = doc.y;
      doc.fontSize(10).fillColor('#64748B').text('Invoice Number', 50, metaTop);
      doc.fillColor('#1E293B').text(inv.invoiceNumber, 50, metaTop + 14);
      doc.fillColor('#64748B').text('Issued', 50, metaTop + 34);
      doc.fillColor('#1E293B').text(fmtDate(inv.issuedAt || inv.createdAt), 50, metaTop + 48);

      doc.fillColor('#64748B').text('Due Date', 350, metaTop);
      doc.fillColor('#1E293B').text(fmtDate(inv.dueDate), 350, metaTop + 14);
      doc.fillColor('#64748B').text('Status', 350, metaTop + 34);
      doc.fillColor('#1E293B').text(String(inv.status).toUpperCase(), 350, metaTop + 48);
      doc.moveDown(4);

      // Bill to
      doc.fillColor('#3B82F6').fontSize(12).text('BILL TO');
      doc.fillColor('#1E293B').fontSize(11).text(
        [tenant.firstName, tenant.lastName].filter(Boolean).join(' ') || 'Tenant'
      );
      if (tenant.email) doc.fillColor('#64748B').fontSize(10).text(tenant.email);
      if (property.title || property.address) {
        doc.fillColor('#64748B').fontSize(10).text(property.title || property.address);
      }
      doc.moveDown();

      // Line items table
      const tableTop = doc.y + 10;
      doc.fontSize(10).fillColor('#64748B');
      doc.text('DESCRIPTION', 50, tableTop);
      doc.text('AMOUNT', 400, tableTop, { width: 145, align: 'right' });
      doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor('#E2E8F0').stroke();

      let y = tableTop + 26;
      (inv.lineItems || []).forEach(item => {
        doc.fillColor('#1E293B').fontSize(10).text(item.description, 50, y, { width: 340 });
        doc.text(KES(item.amount), 400, y, { width: 145, align: 'right' });
        y += 22;
      });

      doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#E2E8F0').stroke();
      y += 14;
      doc.fontSize(12).fillColor('#1E293B').text('Total Due', 300, y, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').text(KES(inv.total), 400, y, { width: 145, align: 'right' });
      doc.font('Helvetica');

      // Footer
      doc.fontSize(9).fillColor('#94A3B8').text(
        'This is a computer-generated invoice. Pay via M-Pesa STK Push in your NyumbaSync portal.',
        50, 760, { align: 'center', width: 495 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Email the invoice to the tenant with the PDF attached. Best-effort — logs
 * and returns a result object rather than throwing on delivery failure.
 */
const sendInvoiceEmail = async (invoice) => {
  const inv = await Invoice.findById(invoice._id).populate('tenant property');
  if (!inv || !inv.tenant?.email) {
    return { success: false, message: 'Tenant has no email on file' };
  }

  let attachments = [];
  try {
    const pdf = await renderInvoicePdf(inv);
    attachments = [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }];
  } catch (err) {
    logger.error(`Failed to render PDF for invoice ${inv.invoiceNumber}:`, err);
  }

  const result = await emailService.sendEmail(
    inv.tenant.email,
    `Rent Invoice ${inv.invoiceNumber} - NyumbaSync`,
    'invoice-issued',
    {
      firstName: inv.tenant.firstName || 'Tenant',
      invoiceNumber: inv.invoiceNumber,
      amount: Number(inv.total || 0).toLocaleString('en-KE'),
      dueDate: fmtDate(inv.dueDate),
      period: inv.periodLabel,
      propertyAddress: inv.property?.title || inv.property?.address || 'your property',
      paymentUrl: `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/dashboard/rent`,
      lineItems: (inv.lineItems || []).map(li => ({
        description: li.description,
        amount: Number(li.amount || 0).toLocaleString('en-KE')
      }))
    },
    { attachments }
  );

  if (result?.success !== false) {
    inv.status = 'sent';
    await inv.save();
  }
  return result;
};

/**
 * Mark an invoice settled by a payment.
 */
const markPaid = async (invoice, payment) => {
  // Apply the payment amount; a payment with no amount (e.g. a manual full
  // settlement) clears the whole outstanding balance.
  const outstanding = (invoice.total || 0) - (invoice.amountPaid || 0);
  const applied = payment && payment.amount != null ? Number(payment.amount) : outstanding;
  invoice.amountPaid = (invoice.amountPaid || 0) + applied;
  if (payment) invoice.payment = payment._id;

  if (invoice.amountPaid >= (invoice.total || 0)) {
    invoice.status = 'paid';
    invoice.paidAt = new Date();
  } else if (invoice.amountPaid > 0) {
    invoice.status = 'partially_paid';
  }
  await invoice.save();
  return invoice;
};

/**
 * Append landlord-entered line items to a draft/unpaid invoice. Supports
 * metered water (amount computed from readings) and flat service levies.
 * Water "previousReading" auto-prefills from the lease's last invoice.
 */
const addLineItems = async (invoiceId, items = []) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (['paid', 'void'].includes(invoice.status)) {
    throw new Error(`Cannot edit a ${invoice.status} invoice`);
  }

  for (const it of items) {
    if (it.type === 'water') {
      let prev = it.previousReading;
      if (prev == null) prev = await Invoice.lastWaterReading(invoice.lease);
      const unit = it.unit || 'm³';
      invoice.lineItems.push({
        description: it.description || `Water (${prev} → ${it.currentReading} ${unit})`,
        accountingCode: 'UTILITY',
        meterPrevious: prev,
        meterCurrent: it.currentReading,
        rate: it.rate,
        unit
      });
    } else if (it.type === 'service') {
      invoice.lineItems.push({
        description: it.description,
        accountingCode: 'OTHER',
        amount: Math.round(Number(it.amount))
      });
    }
  }

  await invoice.save();
  return invoice;
};

/**
 * Issue a draft invoice — flips draft → issued and emails it (sendInvoiceEmail
 * then sets status 'sent').
 */
const issueInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'draft') return invoice;
  invoice.status = 'issued';
  invoice.issuedAt = new Date();
  await invoice.save();
  await sendInvoiceEmail(invoice);
  return invoice;
};

/**
 * Resolve and settle the invoice a payment pays for, then mark it paid.
 * Binding precedence:
 *   1. explicit `invoiceId` (threaded from the client / STK initiation) — exact
 *   2. the tenant's oldest open invoice on the property — best-effort fallback
 * Returns the settled invoice, or null when none matched.
 * @param {{ invoiceId?, tenant?, property?, payment? }} opts
 */
const OPEN_STATUSES = ['issued', 'sent', 'overdue', 'partially_paid'];

const settleForPayment = async ({ invoiceId, tenant, property, payment } = {}) => {
  let invoice = null;

  if (invoiceId) {
    invoice = await Invoice.findById(invoiceId);
    // Don't re-settle an already-paid/void invoice.
    if (invoice && !OPEN_STATUSES.includes(invoice.status)) return invoice;
  }

  if (!invoice && tenant && property) {
    invoice = await Invoice.findOne({
      tenant,
      property,
      status: { $in: OPEN_STATUSES }
    }).sort({ dueDate: 1 });
  }

  if (!invoice) return null;
  return markPaid(invoice, payment);
};

/**
 * Apply late fees to overdue invoices that have not yet been penalized.
 * Adds a PENALTY line item sized by the lease's lateFeePercentage and flips
 * the invoice to `overdue`. Idempotent via the lateFeeApplied flag.
 * @returns {{ penalized: number }}
 */
const applyLateFees = async (refDate = new Date()) => {
  const overdue = await Invoice.findOverdue(refDate).populate('lease');
  let penalized = 0;

  for (const inv of overdue) {
    try {
      if (!inv.lateFeeApplied) {
        const pct = inv.lease?.terms?.lateFeePercentage ?? 5;
        const feeBase = inv.subtotal || 0;
        const fee = Math.round((feeBase * pct) / 100);
        if (fee > 0) {
          inv.lineItems.push({
            description: `Late fee (${pct}% of rent)`,
            accountingCode: 'PENALTY',
            amount: fee
          });
          inv.lateFeeApplied = true;
        }
      }
      inv.status = 'overdue';
      await inv.save();
      penalized += 1;
    } catch (err) {
      logger.error(`Failed to apply late fee to invoice ${inv.invoiceNumber}:`, err);
    }
  }

  logger.info(`Late fees: ${penalized} overdue invoice(s) processed`);
  return { penalized };
};

module.exports = {
  generateMonthlyInvoices,
  renderInvoicePdf,
  sendInvoiceEmail,
  markPaid,
  settleForPayment,
  addLineItems,
  issueInvoice,
  applyLateFees
};
