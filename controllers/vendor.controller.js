const Vendor = require('../models/vendor.model');
const { Contact, MaintenanceRequest, Property } = require('../models');
const User = require('../models/user.model');
const { sanitizeBody } = require('../utils/sanitize-body');

// Vendor fields the server controls — clients must not set these (C6).
const VENDOR_PROTECTED = ['user', 'rating'];
const logger = require('../utils/logger');
const communicationService = require('../services/communication.service');
const notificationService = require('../services/notification.service');
const { sendToUser } = require('../websocket/server');

// Urgency values coming from tenant-facing forms may not match the
// MaintenanceRequest priority enum, so translate them here.
const URGENCY_PRIORITY_MAP = {
  low: 'low',
  normal: 'medium',
  medium: 'medium',
  high: 'high',
  urgent: 'emergency',
  emergency: 'emergency'
};

// Service-type → maintenance category mapping.
const SERVICE_CATEGORY_MAP = {
  plumbing: 'plumbing',
  electrical: 'electrical',
  carpentry: 'structural',
  cleaning: 'pest_control',
  security: 'locks_keys',
  hvac: 'hvac',
  appliance: 'appliance',
  other: 'other'
};

// Find or create a Contact record for a vendor so the notification service
// has a recipient. Prefer linking by the vendor's platform user account.
const getOrCreateVendorContact = async (vendor) => {
  let contact = null;

  if (vendor.user) {
    const user = await User.findById(vendor.user).select('firstName lastName email phone');
    if (user) {
      contact = await Contact.findOne({ phone: user.phone });
      if (!contact && user.email) {
        contact = await Contact.findOne({ email: user.email });
      }
      if (!contact) {
        contact = await Contact.create({
          firstName: user.firstName || vendor.company,
          lastName: user.lastName || 'Vendor',
          email: user.email || vendor.email,
          phone: user.phone || vendor.contact,
          roles: ['contractor'],
          primaryRole: 'contractor'
        });
      }
    }
  }

  if (!contact && (vendor.email || vendor.contact)) {
    const query = {};
    if (vendor.email) query.email = vendor.email;
    if (vendor.contact) query.phone = vendor.contact;
    contact = await Contact.findOne(query);
    if (!contact) {
      contact = await Contact.create({
        firstName: vendor.company,
        lastName: 'Vendor',
        email: vendor.email,
        phone: vendor.contact,
        roles: ['contractor'],
        primaryRole: 'contractor'
      });
    }
  }

  return contact;
};

// Helper: notify tenant, landlord and vendor about a maintenance request status change
const notifyRequestStakeholders = async (request, event, extra = {}) => {
  try {
    await request.populate([
      { path: 'tenant', select: 'firstName lastName email phone user' },
      { path: 'property', select: 'title address landlord' },
      { path: 'vendorUser', select: 'firstName lastName email phone' }
    ]);

    const tenantUserId = request.tenant?.user?.toString?.() || request.tenant?._id?.toString?.();
    const landlordId = request.property?.landlord?.toString?.();
    const vendorId = request.vendorUser?._id?.toString?.();

    const payload = {
      requestId: request._id,
      requestNumber: request.requestNumber,
      status: request.status,
      category: request.category,
      event,
      timestamp: new Date(),
      ...extra
    };

    if (tenantUserId) sendToUser(tenantUserId, 'maintenance:updated', payload);
    if (landlordId) sendToUser(landlordId, 'maintenance:updated', payload);
    if (vendorId) sendToUser(vendorId, 'maintenance:updated', payload);
  } catch (err) {
    logger.error(`WS_VENDOR_REQUEST_NOTIFY_FAILURE: ${err.message}`);
  }
};

// Get all vendors
exports.getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find();
    res.json(vendors);
  } catch (error) {
    logger.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

// Get vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    logger.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
};

// Create vendor
exports.createVendor = async (req, res) => {
  try {
    const vendor = new Vendor(sanitizeBody(req.body, VENDOR_PROTECTED));
    await vendor.save();
    res.status(201).json(vendor);
  } catch (error) {
    logger.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
};

// Update vendor
exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndUpdate(id, sanitizeBody(req.body, VENDOR_PROTECTED), { new: true });
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    logger.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
};

// Get tenant vendors
exports.getTenantVendors = async (req, res) => {
  try {
    const { serviceTypes, minRating, availability } = req.query;
    
    let query = {};
    
    if (serviceTypes) {
      query.services = { $in: Array.isArray(serviceTypes) ? serviceTypes : [serviceTypes] };
    }
    
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }
    
    if (availability) {
      query.availability = availability;
    }
    
    const vendors = await Vendor.find(query);
    res.json(vendors);
  } catch (error) {
    logger.error('Error fetching tenant vendors:', error);
    res.status(500).json({ error: 'Failed to fetch tenant vendors' });
  }
};

// Get vendor details
exports.getVendorDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({
      id: vendor._id,
      name: vendor.company,
      serviceTypes: vendor.services || [],
      phone: vendor.contact,
      email: vendor.email,
      rating: vendor.rating || 0,
      availability: vendor.availability || 'available',
      description: vendor.description || '',
      yearsOfExperience: vendor.yearsOfExperience || 0,
      certifications: vendor.certifications || [],
      reviews: vendor.reviews || [],
      commissionRate: vendor.commissionRate ?? 5,
      user: vendor.user
    });
  } catch (error) {
    logger.error('Error fetching vendor details:', error);
    res.status(500).json({ error: 'Failed to fetch vendor details' });
  }
};

// Contact vendor
exports.contactVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { message, subject } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Resolve tenant user and contact (auto-create contact if missing)
    const tenantUser = await User.findById(userId).select('firstName lastName email phone');
    if (!tenantUser) {
      return res.status(404).json({ error: 'Tenant account not found' });
    }
    let tenantContact = await Contact.findOne({ $or: [{ phone: tenantUser.phone }, { email: tenantUser.email }] });
    if (!tenantContact) {
      tenantContact = await Contact.create({
        firstName: tenantUser.firstName || 'Tenant',
        lastName: tenantUser.lastName || 'User',
        email: tenantUser.email,
        phone: tenantUser.phone,
        roles: ['tenant'],
        primaryRole: 'tenant'
      });
    }

    // Resolve vendor contact
    const vendorContact = await getOrCreateVendorContact(vendor);
    if (!vendorContact) {
      return res.status(400).json({ error: 'Vendor has no contact details configured' });
    }

    // Create communication thread
    const communication = await communicationService.sendMessage({
      senderId: tenantContact._id,
      senderRole: 'tenant',
      recipientIds: [vendorContact._id],
      subject: subject || `Enquiry from ${tenantContact.fullName}`,
      body: message,
      messageType: 'text',
      priority: 'normal'
    });

    // Push real-time notification to vendor user if linked
    if (vendor.user) {
      sendToUser(vendor.user.toString(), 'notification', {
        type: 'message_received',
        title: 'New tenant enquiry',
        message: `${tenantContact.fullName}: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`,
        data: { communicationId: communication._id, senderId: userId }
      });
    }

    res.json({
      success: true,
      communicationId: communication._id,
      message: 'Your message has been sent to the vendor'
    });
  } catch (error) {
    logger.error('Error contacting vendor:', error);
    res.status(500).json({ error: 'Failed to contact vendor' });
  }
};

// Request vendor service
exports.requestVendorService = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { serviceType, description, preferredDate, urgency, propertyId } = req.body;
    const userId = req.user.id;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Resolve tenant user and contact (auto-create contact if missing)
    const tenantUser = await User.findById(userId).select('firstName lastName email phone');
    if (!tenantUser) {
      return res.status(404).json({ error: 'Tenant account not found' });
    }
    let tenantContact = await Contact.findOne({ $or: [{ phone: tenantUser.phone }, { email: tenantUser.email }] });
    if (!tenantContact) {
      tenantContact = await Contact.create({
        firstName: tenantUser.firstName || 'Tenant',
        lastName: tenantUser.lastName || 'User',
        email: tenantUser.email,
        phone: tenantUser.phone,
        roles: ['tenant'],
        primaryRole: 'tenant'
      });
    }

    // Resolve property
    let targetPropertyId = propertyId;
    if (!targetPropertyId) {
      const lease = await require('../models/lease.model').findOne({ tenant: userId, status: 'active' });
      targetPropertyId = lease?.property;
    }
    if (!targetPropertyId) {
      return res.status(400).json({ error: 'Property is required. Please select a property for this request.' });
    }

    const property = await Property.findById(targetPropertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Create maintenance request bound to the vendor
    const request = await MaintenanceRequest.create({
      tenant: tenantContact._id,
      property: targetPropertyId,
      vendorUser: vendor.user,
      category: SERVICE_CATEGORY_MAP[serviceType] || serviceType || 'other',
      priority: URGENCY_PRIORITY_MAP[urgency] || 'medium',
      title: `${serviceType || 'Service'} request`,
      description,
      location: 'Tenant request',
      requestedDate: preferredDate ? new Date(preferredDate) : new Date(),
      status: 'submitted'
    });

    await request.populate([
      { path: 'tenant', select: 'firstName lastName email phone' },
      { path: 'property', select: 'title address' }
    ]);

    // Notify vendor
    const vendorContact = await getOrCreateVendorContact(vendor);
    if (vendorContact) {
      await notificationService.sendWorkOrderAssignedNotification(vendorContact._id, {
        requestId: request._id,
        requestNumber: request.requestNumber,
        category: request.category,
        description: request.description,
        priority: request.priority,
        propertyTitle: property.title,
        tenantName: tenantContact.fullName
      });
    }

    // Real-time push to vendor user if the vendor has a linked platform account
    if (vendor.user) {
      sendToUser(vendor.user.toString(), 'notification', {
        type: 'work_order_assigned',
        title: 'New work order assigned',
        message: `${request.category}: ${request.description.substring(0, 80)}${request.description.length > 80 ? '...' : ''}`,
        data: { requestId: request._id, requestNumber: request.requestNumber }
      });
    }

    // Real-time update to tenant
    sendToUser(userId, 'maintenance:updated', {
      requestId: request._id,
      requestNumber: request.requestNumber,
      status: request.status,
      category: request.category,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      requestId: request._id,
      requestNumber: request.requestNumber,
      message: 'Service request submitted successfully'
    });
  } catch (error) {
    logger.error('Error requesting vendor service:', error);
    res.status(500).json({ error: 'Failed to request vendor service' });
  }
};

// Get requests assigned to the logged-in vendor
exports.getVendorRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const query = { vendorUser: userId };
    if (status) query.status = status;

    const requests = await MaintenanceRequest.find(query)
      .populate('tenant', 'firstName lastName phone email')
      .populate('property', 'title address')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error('Error fetching vendor requests:', error);
    res.status(500).json({ error: 'Failed to fetch vendor requests' });
  }
};

// Vendor accepts a request
exports.acceptVendorRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await MaintenanceRequest.findOne({ _id: requestId, vendorUser: userId });
    if (!request) {
      return res.status(404).json({ error: 'Request not found or not assigned to you' });
    }

    await request.acknowledge(userId);
    await request.assignVendor(null, userId);
    request.status = 'acknowledged';
    await request.save();

    notifyRequestStakeholders(request, 'acknowledged');

    res.json({ success: true, message: 'Request accepted', data: request });
  } catch (error) {
    logger.error('Error accepting vendor request:', error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
};

// Vendor starts work
exports.startVendorRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await MaintenanceRequest.findOne({ _id: requestId, vendorUser: userId });
    if (!request) {
      return res.status(404).json({ error: 'Request not found or not assigned to you' });
    }

    await request.startWork(userId);
    notifyRequestStakeholders(request, 'in_progress');

    res.json({ success: true, message: 'Work started', data: request });
  } catch (error) {
    logger.error('Error starting vendor request:', error);
    res.status(500).json({ error: 'Failed to start work' });
  }
};

// Vendor completes work
exports.completeVendorRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;
    const { actualCost, workPerformed, partsUsed, laborHours, laborRate } = req.body;

    const request = await MaintenanceRequest.findOne({ _id: requestId, vendorUser: userId });
    if (!request) {
      return res.status(404).json({ error: 'Request not found or not assigned to you' });
    }

    if (actualCost != null) request.actualCost = Math.round(Number(actualCost));
    if (workPerformed) request.workPerformed = workPerformed;
    if (partsUsed) request.partsUsed = partsUsed;
    if (laborHours != null) request.laborHours = laborHours;
    if (laborRate != null) request.laborRate = laborRate;

    await request.completeWork({ actualCost: request.actualCost, workPerformed }, userId);
    notifyRequestStakeholders(request, 'completed', { actualCost: request.actualCost });

    res.json({ success: true, message: 'Work completed', data: request });
  } catch (error) {
    logger.error('Error completing vendor request:', error);
    res.status(500).json({ error: 'Failed to complete work' });
  }
};

// Vendor closes a request after tenant confirms
exports.closeVendorRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await MaintenanceRequest.findOne({ _id: requestId, vendorUser: userId });
    if (!request) {
      return res.status(404).json({ error: 'Request not found or not assigned to you' });
    }

    await request.close(userId);
    notifyRequestStakeholders(request, 'closed');

    res.json({ success: true, message: 'Request closed', data: request });
  } catch (error) {
    logger.error('Error closing vendor request:', error);
    res.status(500).json({ error: 'Failed to close request' });
  }
};
