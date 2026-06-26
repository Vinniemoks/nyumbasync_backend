const Invoice = require('../models/invoice.model');
const invoiceService = require('../services/invoice.service');
const reminderService = require('../services/reminder.service');
const logger = require('../utils/logger');

// Pull the caller's role from the authenticated user (supports both the
// single `role` field and the legacy `roles` array, like auth.middleware).
const roleOf = (user) => (Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean));

// GET /api/v1/invoices — role-aware listing
exports.listInvoices = async (req, res) => {
  try {
    const roles = roleOf(req.user);
    const query = roles.includes('landlord')
      ? { landlord: req.user.id }
      : { tenant: req.user.id };

    if (req.query.status) query.status = req.query.status;

    const invoices = await Invoice.find(query)
      .populate('property', 'title address')
      .sort({ createdAt: -1 });

    res.status(200).json(invoices);
  } catch (err) {
    logger.error('Failed to list invoices:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// GET /api/v1/invoices/:id
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('tenant', 'firstName lastName email')
      .populate('property', 'title address')
      .populate('landlord', 'firstName lastName email');

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!canAccess(req.user, invoice)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.status(200).json(invoice);
  } catch (err) {
    logger.error('Failed to fetch invoice:', err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// GET /api/v1/invoices/:id/pdf — streams the rendered PDF
exports.downloadInvoicePdf = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!canAccess(req.user, invoice)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const pdf = await invoiceService.renderInvoicePdf(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdf.length
    });
    res.send(pdf);
  } catch (err) {
    logger.error('Failed to render invoice PDF:', err);
    res.status(500).json({ error: 'Failed to render invoice PDF' });
  }
};

// POST /api/v1/invoices/generate — landlord manual trigger
exports.generateInvoices = async (req, res) => {
  try {
    const filter = { landlord: req.user.id };
    if (req.body.propertyId) filter.property = req.body.propertyId;
    if (req.body.leaseId) filter._id = req.body.leaseId;

    const refDate = req.body.month ? new Date(req.body.month) : new Date();
    const result = await invoiceService.generateMonthlyInvoices(refDate, filter);

    // Best-effort delivery of any newly created invoices.
    const sendEmails = req.body.send !== false;
    if (sendEmails) {
      for (const inv of result.invoices) {
        if (inv.status === 'issued') {
          invoiceService.sendInvoiceEmail(inv).catch(e =>
            logger.error(`Invoice email failed for ${inv.invoiceNumber}:`, e));
        }
      }
    }

    res.status(201).json({
      message: `${result.created} invoice(s) created, ${result.skipped} already existed`,
      created: result.created,
      skipped: result.skipped
    });
  } catch (err) {
    logger.error('Failed to generate invoices:', err);
    res.status(500).json({ error: 'Failed to generate invoices' });
  }
};

// POST /api/v1/invoices/:id/send — landlord (re)send
exports.sendInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (String(invoice.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await invoiceService.sendInvoiceEmail(invoice);
    res.status(200).json({ message: 'Invoice sent', result });
  } catch (err) {
    logger.error('Failed to send invoice:', err);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
};

// POST /api/v1/invoices/:id/line-items — landlord adds water/service charges
exports.addLineItems = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (String(invoice.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No line items provided' });

    const updated = await invoiceService.addLineItems(invoice._id, items);
    res.status(200).json(updated);
  } catch (err) {
    logger.error('Failed to add line items:', err);
    res.status(400).json({ error: err.message || 'Failed to add line items' });
  }
};

// POST /api/v1/invoices/:id/issue — landlord issues a draft (and emails it)
exports.issueInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (String(invoice.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const issued = await invoiceService.issueInvoice(invoice._id);
    res.status(200).json(issued);
  } catch (err) {
    logger.error('Failed to issue invoice:', err);
    res.status(500).json({ error: 'Failed to issue invoice' });
  }
};

// POST /api/v1/invoices/:id/remind — landlord reminds the tenant (multi-channel)
exports.remindInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('tenant', 'firstName lastName email phone')
      .populate('property', 'title address');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (String(invoice.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const channels = Array.isArray(req.body.channels) && req.body.channels.length
      ? req.body.channels
      : ['sms'];

    const results = await reminderService.sendInvoiceReminder(invoice, channels);
    invoice.reminderSentAt = new Date();
    await invoice.save();
    res.status(200).json({ message: 'Reminder sent', channels, results });
  } catch (err) {
    logger.error('Failed to send reminder:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
};

// Normalize a ref that may be an ObjectId or a populated document.
const refId = (ref) => String(ref?._id || ref || '');

// A tenant may read their own invoices; a landlord, invoices they issued.
function canAccess(user, invoice) {
  const id = String(user.id);
  return refId(invoice.tenant) === id || refId(invoice.landlord) === id;
}
