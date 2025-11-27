const Maintenance = require('../models/maintenance.model');
const Vendor = require('../models/vendor.model');
const emailService = require('../services/emailService');

// Submit repair request
exports.submitRequest = async (req, res) => {
  try {
    const { propertyId, issueType, description } = req.body;

    // Create request
    const request = await Maintenance.create({
      property: propertyId,
      reportedBy: req.user.id,
      issueType,
      description,
      status: 'reported'
    });

    // Auto-assign vendor in Nairobi
    const vendor = await Vendor.findOne({
      subcounties: req.property.subcounty,
      services: issueType,
      available: true
    }).sort('avgResponseTime');

    if (vendor) {
      request.assignedVendor = vendor._id;
      request.status = 'assigned';
      await request.save();

      // TODO: Send WhatsApp alert to vendor
    }

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({
      error: 'Request submission failed',
      emergencyContact: '0709119119 (Nairobi County)'
    });
  }
};

// Vendor updates status
exports.updateStatus = async (req, res) => {
  try {
    const { status, completionProof } = req.body;

    const request = await Maintenance.findById(req.params.id);

    // Validate vendor ownership
    if (req.user.role === 'vendor' &&
      !request.assignedVendor.equals(req.user._id)) {
      return res.status(403).json({
        error: 'Unauthorized - Assigned vendor only'
      });
    }

    request.status = status;
    if (completionProof) request.completionProof = completionProof;
    await request.save();

    // TODO: Notify tenant via SMS

    res.json(request);
  } catch (err) {
    res.status(500).json({
      error: 'Status update failed',
      action: 'Call tenant directly if urgent'
    });
  }
};

// Add these functions:
exports.getMyRequests = async (req, res) => {
  // Implement logic to fetch requests for the logged-in tenant
  res.json([]); // Placeholder
};

exports.getPropertyRequests = async (req, res) => {
  // Implement logic to fetch requests for a property (landlord view)
  res.json([]); // Placeholder
};



// Get tenant maintenance requests
exports.getTenantMaintenanceRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const requests = await Maintenance.find({ reportedBy: userId })
      .populate('property')
      .populate('assignedVendor')
      .sort({ createdAt: -1 });

    res.json(requests.map(req => ({
      id: req._id,
      ticketNumber: req.ticketNumber || `TKT-${req._id}`,
      title: req.issueType,
      description: req.description,
      category: req.issueType,
      priority: req.priority || 'medium',
      status: req.status,
      propertyId: req.property?._id,
      tenantId: req.reportedBy,
      date: req.createdAt,
      time: req.createdAt,
      createdAt: req.createdAt
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
};

// Get specific tenant maintenance request
exports.getTenantMaintenanceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const request = await Maintenance.findOne({
      _id: id,
      reportedBy: userId
    })
      .populate('property')
      .populate('assignedVendor');

    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    res.json({
      id: request._id,
      ticketNumber: request.ticketNumber || `TKT-${request._id}`,
      title: request.issueType,
      description: request.description,
      category: request.issueType,
      priority: request.priority || 'medium',
      status: request.status,
      date: request.createdAt,
      createdAt: request.createdAt,
      statusHistory: request.statusHistory || [],
      assignedVendor: request.assignedVendor ? {
        id: request.assignedVendor._id,
        name: request.assignedVendor.name,
        phone: request.assignedVendor.phone,
        estimatedArrival: 'Within 24 hours'
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance request' });
  }
};

// Create maintenance request
exports.createMaintenanceRequest = async (req, res) => {
  try {
    const { title, description, category, priority, propertyId } = req.body;
    const userId = req.user.id;

    const request = await Maintenance.create({
      property: propertyId,
      reportedBy: userId,
      issueType: category || title,
      title: title,
      description,
      priority: priority || 'medium',
      status: 'submitted',
      ticketNumber: `TKT-${Date.now()}`
    });

    // Populate user and property for email
    await request.populate('property reportedBy');

    // Send maintenance notification email
    try {
      await emailService.sendMaintenanceUpdate(request, request.reportedBy, 'created');
    } catch (emailError) {
      console.error('Failed to send maintenance notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      id: request._id,
      ticketNumber: request.ticketNumber,
      title: request.issueType,
      description: request.description,
      category: request.issueType,
      priority: request.priority,
      status: request.status,
      propertyId: request.property,
      tenantId: request.reportedBy,
      createdAt: request.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create maintenance request' });
  }
};

// Update maintenance request
exports.updateMaintenanceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user.id;

    const request = await Maintenance.findOneAndUpdate(
      { _id: id, reportedBy: userId },
      {
        status,
        $push: {
          statusHistory: {
            status,
            timestamp: new Date(),
            note
          }
        }
      },
      { new: true }
    ).populate('property reportedBy');

    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    // Send update email notification
    try {
      await emailService.sendMaintenanceUpdate(request, request.reportedBy, status === 'completed' ? 'completed' : 'updated');
    } catch (emailError) {
      console.error('Failed to send maintenance update email:', emailError);
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update maintenance request' });
  }
};

// Rate maintenance request
exports.rateMaintenanceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;
    const userId = req.user.id;

    const request = await Maintenance.findOneAndUpdate(
      { _id: id, reportedBy: userId },
      {
        rating,
        feedback,
        ratedAt: new Date()
      },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    res.json({
      success: true,
      message: 'Thank you for your feedback!'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rate maintenance request' });
  }
};
