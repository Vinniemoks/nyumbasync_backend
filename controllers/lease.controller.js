const Lease = require('../models/lease.model');
const { generateLeasePDF } = require('../services/document.service');
const logger = require('../utils/logger');

// Create Kenyan-compliant lease
exports.createLease = async (req, res) => {
  try {
    const { propertyId, tenantId, startDate, endDate, monthlyRent, securityDeposit } = req.body;
    let { terms } = req.body;

    if (!propertyId || !tenantId) {
      return res.status(400).json({ error: 'propertyId and tenantId are required' });
    }

    // Accept either a structured `terms` object or the flat shape some clients
    // send (monthlyRent/securityDeposit + start/end dates; `terms` may even be a
    // free-text note). Normalise to the model's terms object either way.
    if (!terms || typeof terms !== 'object' || terms.rentAmount == null) {
      let durationMonths = terms && terms.durationMonths;
      if (!durationMonths && startDate && endDate) {
        const ms = new Date(endDate) - new Date(startDate);
        durationMonths = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30)));
      }
      terms = {
        rentAmount: (terms && terms.rentAmount) ?? monthlyRent,
        depositAmount: (terms && terms.depositAmount) ?? securityDeposit,
        durationMonths: durationMonths || 12,
        rentDueDate: (terms && terms.rentDueDate) || 5,
        terminationNotice: (terms && terms.terminationNotice) || 2
      };
    }

    if (terms.rentAmount == null) {
      return res.status(400).json({ error: 'A rent amount (terms.rentAmount or monthlyRent) is required' });
    }

    // Validate Kenyan notice periods
    if (terms.terminationNotice < 1 ||
        (req.user.role === 'landlord' && terms.terminationNotice < 2)) {
      return res.status(400).json({
        error: 'Notice period too short per Kenyan law'
      });
    }

    const lease = await Lease.create({
      property: propertyId,
      tenant: tenantId,
      terms,
      // startDate is required and drives the endDate derivation — it was being
      // dropped from the request body, so every create failed validation.
      startDate: startDate || new Date(),
      ...(endDate ? { endDate } : {}),
      status: 'draft'
    });

    // Generate PDF (best-effort, fire-and-forget). Never let a PDF/asset error
    // become an unhandled rejection or fail the create.
    Promise.resolve(generateLeasePDF(lease._id)).catch((pdfErr) =>
      logger.error('Lease PDF generation failed:', pdfErr)
    );

    res.status(201).json(lease);
  } catch (err) {
    logger.error('Lease creation failed:', err);
    res.status(500).json({
      error: 'Lease creation failed',
      legalContact: 'lawyers@nyumbasync.com'
    });
  }
};

// E-signature handler
exports.signLease = async (req, res) => {
  try {
    // The route param is :leaseId (req.params.id was always undefined here).
    const lease = await Lease.findById(req.params.leaseId || req.params.id).populate('property');
    if (!lease) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    // Validate parties
    if ((req.user.role === 'landlord' && !lease.property.landlord.equals(req.user._id)) ||
        (req.user.role === 'tenant' && !lease.tenant.equals(req.user._id))) {
      return res.status(403).json({ error: 'Unauthorized signature' });
    }

    // Record signature. signedAt is a Date field — store an actual Date, not a
    // locale-formatted string (which fails the schema's date cast).
    const signature = {
      signedAt: new Date(),
      ipAddress: req.ip,
      signature: req.body.signature
    };

    if (req.user.role === 'landlord') {
      lease.signatures.landlord = signature;
    } else {
      lease.signatures.tenant = signature;
    }

    // Check if fully executed
    if (lease.signatures.landlord && lease.signatures.tenant) {
      lease.status = 'active';
      // TODO: Trigger deposit payment
    }

    await lease.save();
    res.json(lease);
  } catch (err) {
    logger.error('Lease signing failed:', err);
    res.status(500).json({
      error: 'Signing failed',
      alternative: 'Print and sign manually'
    });
  }
};

// --- Lease lookups ---------------------------------------------------------
// These were referenced by routes/v1/lease.routes.js but never implemented,
// so every list/detail lease endpoint 500'd. Each is a straightforward query.

exports.getAllLeases = async (req, res) => {
  try {
    const leases = await Lease.find().populate('property tenant landlord').sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leases' });
  }
};

exports.getLeaseById = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.id).populate('property tenant landlord');
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    res.json(lease);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lease' });
  }
};

exports.getLeasesByTenant = async (req, res) => {
  try {
    const leases = await Lease.find({ tenant: req.params.tenantId }).populate('property landlord').sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant leases' });
  }
};

exports.getLeasesByProperty = async (req, res) => {
  try {
    const leases = await Lease.find({ property: req.params.propertyId }).populate('tenant landlord').sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property leases' });
  }
};

exports.getLeasesByLandlord = async (req, res) => {
  try {
    const leases = await Lease.find({ landlord: req.params.landlordId }).populate('property tenant').sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlord leases' });
  }
};

exports.updateLease = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    Object.assign(lease, req.body);
    await lease.save();
    res.json(lease);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lease' });
  }
};

exports.deleteLease = async (req, res) => {
  try {
    const lease = await Lease.findByIdAndDelete(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    res.json({ success: true, message: 'Lease deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lease' });
  }
};

// GET /leases/landlord — the authenticated landlord's own leases (the clients
// call this id-less variant; without it the path collided with /:id and 500'd).
exports.getMyLeases = async (req, res) => {
  try {
    const filter = req.user.role === 'tenant'
      ? { tenant: req.user.id }
      : { landlord: req.user.id };
    const leases = await Lease.find(filter).populate('property tenant landlord').sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    logger.error('Failed to fetch own leases:', err);
    res.status(500).json({ error: 'Failed to fetch leases' });
  }
};

// --- Renewal & termination -------------------------------------------------

exports.renewLease = async (req, res) => {
  try {
    const { rentAmount, durationMonths, startDate, endDate } = req.body;
    const lease = await Lease.findById(req.params.leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const newStart = startDate ? new Date(startDate) : new Date(lease.endDate || Date.now());
    // Honor an explicit endDate (some clients send only that); otherwise extend
    // by the requested/existing duration.
    let newEnd, months;
    if (endDate) {
      newEnd = new Date(endDate);
      months = Math.max(1, Math.round((newEnd - newStart) / (1000 * 60 * 60 * 24 * 30)));
    } else {
      months = durationMonths || lease.terms.durationMonths;
      newEnd = new Date(newStart);
      newEnd.setMonth(newEnd.getMonth() + months);
    }

    // Apply the new terms and extend the lease.
    if (rentAmount) lease.terms.rentAmount = rentAmount;
    lease.terms.durationMonths = months;
    lease.startDate = newStart;
    lease.endDate = newEnd;
    lease.status = 'active';
    lease.renewal = {
      ...(lease.renewal || {}),
      isEligible: true,
      newTerms: { rentAmount: lease.terms.rentAmount, durationMonths: months, startDate: newStart },
      requestedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: req.user.id
    };
    await lease.save();
    res.json(lease);
  } catch (err) {
    logger.error('Lease renewal failed:', err);
    res.status(500).json({ error: 'Failed to renew lease' });
  }
};

exports.terminateLease = async (req, res) => {
  try {
    // Accept terminationDate as an alias for effectiveDate (clients vary).
    const { reason, effectiveDate, terminationDate, penaltyAmount } = req.body;
    const lease = await Lease.findById(req.params.leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const effective = effectiveDate || terminationDate;
    lease.termination = {
      initiatedBy: req.user.role === 'tenant' ? 'tenant' : 'landlord',
      reason: reason || 'Not specified',
      noticeDate: new Date(),
      effectiveDate: effective ? new Date(effective) : new Date(),
      penaltyAmount: penaltyAmount || 0
    };
    lease.status = 'terminated';
    await lease.save();
    res.json(lease);
  } catch (err) {
    logger.error('Lease termination failed:', err);
    res.status(500).json({ error: 'Failed to terminate lease' });
  }
};

// --- Lease documents -------------------------------------------------------

exports.getLeaseDocuments = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.leaseId).select('documents');
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    res.json(lease.documents || []);
  } catch (err) {
    logger.error('Failed to fetch lease documents:', err);
    res.status(500).json({ error: 'Failed to fetch lease documents' });
  }
};

exports.uploadLeaseDocument = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const file = req.file;
    const url = file ? file.path : req.body.url;
    if (!url) return res.status(400).json({ error: 'A file or document url is required' });

    const doc = {
      name: req.body.name || (file && file.originalname) || 'Lease document',
      url,
      type: req.body.type || 'lease_agreement',
      uploadedBy: req.user.id
    };
    lease.documents.push(doc);
    await lease.save();
    res.status(201).json({ success: true, document: lease.documents[lease.documents.length - 1] });
  } catch (err) {
    logger.error('Failed to upload lease document:', err);
    res.status(500).json({ error: 'Failed to upload lease document' });
  }
};

exports.getLeaseDocument = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.leaseId).select('documents');
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    const doc = lease.documents.id(req.params.documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    logger.error('Failed to fetch lease document:', err);
    res.status(500).json({ error: 'Failed to fetch lease document' });
  }
};

exports.downloadLeaseDocument = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.leaseId).select('documents');
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    const doc = lease.documents.id(req.params.documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Remote URL → redirect; local path → stream the file.
    if (/^https?:\/\//.test(doc.url)) {
      return res.redirect(doc.url);
    }
    return res.download(doc.url, doc.name, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File unavailable' });
    });
  } catch (err) {
    logger.error('Failed to download lease document:', err);
    res.status(500).json({ error: 'Failed to download lease document' });
  }
};

// --- Templates -------------------------------------------------------------
// There is no Template model; these are the standard Kenyan lease templates the
// UI offers. generateLeaseFromTemplate just seeds a draft lease from the chosen
// template's defaults plus the property/tenant/terms in the request body.

const LEASE_TEMPLATES = [
  { id: 'residential-standard', name: 'Residential (Standard)', durationMonths: 12, terminationNotice: 2, description: 'Standard 12-month residential tenancy under the Kenyan Rent Act.' },
  { id: 'residential-short', name: 'Residential (Short-stay)', durationMonths: 6, terminationNotice: 1, description: 'Six-month short-stay residential tenancy.' },
  { id: 'commercial-standard', name: 'Commercial (Standard)', durationMonths: 24, terminationNotice: 3, description: 'Two-year commercial lease.' }
];

exports.getLeaseTemplates = async (req, res) => {
  res.json(LEASE_TEMPLATES);
};

exports.generateLeaseFromTemplate = async (req, res) => {
  try {
    const template = LEASE_TEMPLATES.find(t => t.id === req.params.templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const { propertyId, tenantId, terms = {}, startDate } = req.body;
    if (!propertyId || !tenantId) {
      return res.status(400).json({ error: 'propertyId and tenantId are required' });
    }

    const lease = await Lease.create({
      property: propertyId,
      tenant: tenantId,
      startDate: startDate || new Date(),
      terms: {
        durationMonths: terms.durationMonths || template.durationMonths,
        terminationNotice: terms.terminationNotice || template.terminationNotice,
        rentAmount: terms.rentAmount,
        depositAmount: terms.depositAmount,
        rentDueDate: terms.rentDueDate || 5
      },
      status: 'draft'
    });
    res.status(201).json(lease);
  } catch (err) {
    logger.error('Failed to generate lease from template:', err);
    res.status(500).json({ error: 'Failed to generate lease from template' });
  }
};
