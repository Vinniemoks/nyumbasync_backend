const Maintenance = require('../models/maintenance.model');
const Vendor = require('../models/vendor.model');
const Property = require('../models/property.model');
const emailService = require('../services/emailService');
const { sendToUser } = require('../websocket/server');

// Map a Maintenance doc to the shape the clients expect.
const toMaintenanceDTO = (req) => ({
  id: req._id,
  ticketNumber: req.ticketNumber || `TKT-${req._id}`,
  title: req.issueType,
  description: req.description,
  category: req.issueType,
  priority: req.priority || 'medium',
  status: req.status,
  propertyId: req.property?._id || req.property,
  tenantId: req.reportedBy?._id || req.reportedBy,
  createdAt: req.createdAt
});

// GET /maintenance — role-aware list. Tenants see their own requests; landlords
// see every request across the properties they own; admins/managers see all.
// (No such aggregate route existed before, so the desktop/mobile list 404'd.)
exports.getMaintenanceRequests = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'tenant') {
      filter = { reportedBy: req.user.id };
    } else if (req.user.role === 'landlord') {
      const propertyIds = await Property.find({ landlord: req.user.id }).distinct('_id');
      filter = { property: { $in: propertyIds } };
    } // admin/manager → all

    const requests = await Maintenance.find(filter)
      .populate('property')
      .populate('reportedBy', 'firstName lastName phone')
      .sort({ createdAt: -1 });

    res.json(requests.map(toMaintenanceDTO));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
};

// PUT /maintenance/:id — landlord/manager/admin update of status/priority/vendor.
// Landlords may only touch requests on properties they own.
exports.manageMaintenanceRequest = async (req, res) => {
  try {
    const { status, priority, assignedVendor, note } = req.body;
    const request = await Maintenance.findById(req.params.id).populate('property');
    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    if (req.user.role === 'landlord') {
      const ownerId = request.property?.landlord?.toString();
      if (ownerId !== req.user.id.toString()) {
        return res.status(403).json({ error: 'Not authorized for this maintenance request' });
      }
    }

    if (status) request.status = status;
    if (priority) request.priority = priority;
    if (assignedVendor) request.assignedVendor = assignedVendor;
    if (note) {
      request.statusHistory = request.statusHistory || [];
      request.statusHistory.push({ status: status || request.status, note, at: new Date() });
    }
    await request.save();

    // Real-time WebSocket broadcast to tenant and landlord
    try {
      const tenantId = request.reportedBy?.toString();
      const landlordId = request.property?.landlord?.toString();
      const payload = {
        requestId: request._id,
        status: request.status,
        priority: request.priority,
        assignedVendor: request.assignedVendor,
        note,
        timestamp: new Date()
      };
      if (tenantId) sendToUser(tenantId, 'maintenance:updated', payload);
      if (landlordId) sendToUser(landlordId, 'maintenance:updated', payload);
    } catch (wsErr) {
      console.error('WS_MAINTENANCE_BROADCAST_FAILURE:', wsErr.message);
    }

    res.json(toMaintenanceDTO(request));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update maintenance request' });
  }
};

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

    // Real-time WebSocket broadcast to landlord
    try {
      const property = await Property.findById(propertyId);
      if (property?.landlord) {
        sendToUser(property.landlord.toString(), 'maintenance:updated', {
          requestId: request._id,
          status: request.status,
          issueType,
          description,
          propertyId,
          tenantId: req.user.id,
          timestamp: new Date()
        });
      }
    } catch (wsErr) {
      console.error('WS_MAINTENANCE_SUBMIT_FAILURE:', wsErr.message);
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

    // Real-time WebSocket broadcast to tenant and landlord
    try {
      await request.populate('property');
      const landlordId = request.property?.landlord?.toString();
      const tenantId = request.reportedBy?.toString();
      if (tenantId) {
        sendToUser(tenantId, 'maintenance:updated', {
          requestId: request._id,
          status,
          timestamp: new Date()
        });
      }
      if (landlordId) {
        sendToUser(landlordId, 'maintenance:updated', {
          requestId: request._id,
          status,
          timestamp: new Date()
        });
      }
    } catch (wsErr) {
      console.error('WS_VENDOR_UPDATE_FAILURE:', wsErr.message);
    }

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

    // property + description are required by the Maintenance model.
    if (!propertyId || !description) {
      return res.status(400).json({ error: 'propertyId and description are required' });
    }

    const request = await Maintenance.create({
      property: propertyId,
      reportedBy: userId,
      issueType: category || title,
      title: title,
      description,
      priority: priority || 'medium',
      // 'reported' is the model's initial status enum value (not 'submitted').
      status: 'reported',
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

    // Real-time WebSocket broadcast to tenant and landlord
    try {
      const tenantId = request.reportedBy?._id?.toString();
      const landlordId = request.property?.landlord?.toString();
      const payload = {
        requestId: request._id,
        status: request.status,
        issueType: request.issueType,
        description: request.description,
        propertyId: request.property?._id || propertyId,
        tenantId,
        timestamp: new Date()
      };
      if (tenantId) sendToUser(tenantId, 'maintenance:updated', payload);
      if (landlordId) sendToUser(landlordId, 'maintenance:updated', payload);
    } catch (wsErr) {
      console.error('WS_MAINTENANCE_CREATE_FAILURE:', wsErr.message);
    }

    res.status(201).json({
      id: request._id,
      // The model doesn't persist ticketNumber; derive it like the GET endpoints.
      ticketNumber: request.ticketNumber || `TKT-${request._id}`,
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

    // Real-time WebSocket broadcast to tenant and landlord
    try {
      const tenantId = request.reportedBy?._id?.toString();
      const landlordId = request.property?.landlord?.toString();
      const payload = {
        requestId: request._id,
        status: request.status,
        note,
        timestamp: new Date()
      };
      if (tenantId) sendToUser(tenantId, 'maintenance:updated', payload);
      if (landlordId) sendToUser(landlordId, 'maintenance:updated', payload);
    } catch (wsErr) {
      console.error('WS_MAINTENANCE_UPDATE_FAILURE:', wsErr.message);
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
