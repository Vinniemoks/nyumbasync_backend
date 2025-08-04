const Lease = require('../../models/lease.model');
const { generateLeasePDF } = require('../services/document.service');

// Create Kenyan-compliant lease
exports.createLease = async (req, res) => {
  try {
    const { propertyId, tenantId, terms } = req.body;

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
      status: 'draft'
    });

    // Generate PDF (async)
    generateLeasePDF(lease._id);

    res.status(201).json(lease);
  } catch (err) {
    res.status(500).json({ 
      error: 'Lease creation failed',
      legalContact: 'lawyers@nyumbasync.com' 
    });
  }
};

// E-signature handler
exports.signLease = async (req, res) => {
  try {
    const lease = await Lease.findById(req.params.id);

    // Validate parties
    if ((req.user.role === 'landlord' && !lease.property.landlord.equals(req.user._id)) ||
        (req.user.role === 'tenant' && !lease.tenant.equals(req.user._id))) {
      return res.status(403).json({ error: 'Unauthorized signature' });
    }

    // Record signature with Kenyan timestamp
    const signature = {
      signedAt: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
      ipAddress: req.ip
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
    res.status(500).json({ 
      error: 'Signing failed',
      alternative: 'Print and sign manually' 
    });
  }
};
