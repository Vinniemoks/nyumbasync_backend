/**
 * Maintenance Request Controller
 * Handles maintenance request operations
 */

const MaintenanceRequest = require('../models/maintenance-request.model');
const { Contact, Property } = require('../models');
const logger = require('../utils/logger');

/**
 * Create maintenance request
 * POST /api/maintenance-requests
 */
exports.createRequest = async (req, res) => {
  try {
    const requestData = req.body;
    
    // If tenant is authenticated via portal
    if (req.tenantContact) {
      requestData.tenant = req.tenantContact._id;
    }
    
    const request = await MaintenanceRequest.create(requestData);
    
    await request.populate([
      { path: 'tenant', select: 'firstName lastName email phone' },
      { path: 'property', select: 'title address' }
    ]);
    
    logger.info(`Maintenance request created: ${request.requestNumber}`);
    
    res.status(201).json({
      success: true,
      message: 'Maintenance request submitted successfully',
      data: request
    });
  } catch (error) {
    logger.error(`Error creating maintenance request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all maintenance requests
 * GET /api/maintenance-requests
 */
exports.getAllRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      category,
      property,
      tenant
    } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (property) query.property = property;
    if (tenant) query.tenant = tenant;
    
    const skip = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      MaintenanceRequest.find(query)
        .populate('tenant', 'firstName lastName email phone')
        .populate('property', 'title address')
        .populate('assignedTo', 'firstName lastName company phone email')
        .sort({ requestedDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MaintenanceRequest.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error getting maintenance requests: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single maintenance request
 * GET /api/maintenance-requests/:id
 */
exports.getRequestById = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('tenant', 'firstName lastName email phone')
      .populate('property', 'title address')
      .populate('assignedTo', 'firstName lastName company phone email')
      .populate('statusHistory.changedBy', 'firstName lastName')
      .populate('updates.sentBy', 'firstName lastName')
      .populate('internalNotes.createdBy', 'firstName lastName');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    logger.error(`Error getting maintenance request: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update maintenance request
 * PUT /api/maintenance-requests/:id
 */
exports.updateRequest = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Maintenance request updated successfully',
      data: request
    });
  } catch (error) {
    logger.error(`Error updating maintenance request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Acknowledge request
 * POST /api/maintenance-requests/:id/acknowledge
 */
exports.acknowledgeRequest = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.acknowledge(req.user?._id);
    
    res.json({
      success: true,
      message: 'Request acknowledged',
      data: request
    });
  } catch (error) {
    logger.error(`Error acknowledging request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Schedule request
 * POST /api/maintenance-requests/:id/schedule
 */
exports.scheduleRequest = async (req, res) => {
  try {
    const { scheduledDate, timeSlot } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.schedule(new Date(scheduledDate), timeSlot, req.user?._id);
    
    res.json({
      success: true,
      message: 'Request scheduled',
      data: request
    });
  } catch (error) {
    logger.error(`Error scheduling request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Assign vendor
 * POST /api/maintenance-requests/:id/assign
 */
exports.assignVendor = async (req, res) => {
  try {
    const { vendorId } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.assignVendor(vendorId, req.user?._id);
    
    res.json({
      success: true,
      message: 'Vendor assigned',
      data: request
    });
  } catch (error) {
    logger.error(`Error assigning vendor: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Start work
 * POST /api/maintenance-requests/:id/start
 */
exports.startWork = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.startWork(req.user?._id);
    
    res.json({
      success: true,
      message: 'Work started',
      data: request
    });
  } catch (error) {
    logger.error(`Error starting work: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Complete work
 * POST /api/maintenance-requests/:id/complete
 */
exports.completeWork = async (req, res) => {
  try {
    const workDetails = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.completeWork(workDetails, req.user?._id);
    
    // Update tenant maintenance stats
    const contact = await Contact.findById(request.tenant);
    if (contact) {
      const responseTime = request.responseTime || 0;
      await contact.closeMaintenanceRequest(responseTime);
    }
    
    res.json({
      success: true,
      message: 'Work completed',
      data: request
    });
  } catch (error) {
    logger.error(`Error completing work: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Close request
 * POST /api/maintenance-requests/:id/close
 */
exports.closeRequest = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.close(req.user?._id);
    
    res.json({
      success: true,
      message: 'Request closed',
      data: request
    });
  } catch (error) {
    logger.error(`Error closing request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Cancel request
 * POST /api/maintenance-requests/:id/cancel
 */
exports.cancelRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.cancel(reason, req.user?._id);
    
    res.json({
      success: true,
      message: 'Request cancelled',
      data: request
    });
  } catch (error) {
    logger.error(`Error cancelling request: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add update/comment
 * POST /api/maintenance-requests/:id/updates
 */
exports.addUpdate = async (req, res) => {
  try {
    const { message } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.addUpdate(message, req.user?._id || req.tenantContact?._id);
    
    res.json({
      success: true,
      message: 'Update added',
      data: request
    });
  } catch (error) {
    logger.error(`Error adding update: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Submit feedback
 * POST /api/maintenance-requests/:id/feedback
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Maintenance request not found'
      });
    }
    
    await request.submitFeedback(rating, feedback);
    
    res.json({
      success: true,
      message: 'Feedback submitted',
      data: request
    });
  } catch (error) {
    logger.error(`Error submitting feedback: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get requests by tenant
 * GET /api/maintenance-requests/by-tenant/:tenantId
 */
exports.getByTenant = async (req, res) => {
  try {
    const { status } = req.query;
    const requests = await MaintenanceRequest.findByTenant(
      req.params.tenantId,
      { status }
    );
    
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error getting requests by tenant: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get requests by property
 * GET /api/maintenance-requests/by-property/:propertyId
 */
exports.getByProperty = async (req, res) => {
  try {
    const { status } = req.query;
    const requests = await MaintenanceRequest.findByProperty(
      req.params.propertyId,
      { status }
    );
    
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error getting requests by property: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get open requests
 * GET /api/maintenance-requests/open
 */
exports.getOpenRequests = async (req, res) => {
  try {
    const requests = await MaintenanceRequest.findOpenRequests();
    
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error getting open requests: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get overdue requests
 * GET /api/maintenance-requests/overdue
 */
exports.getOverdueRequests = async (req, res) => {
  try {
    const requests = await MaintenanceRequest.findOverdueRequests();
    
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error getting overdue requests: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get emergency requests
 * GET /api/maintenance-requests/emergency
 */
exports.getEmergencyRequests = async (req, res) => {
  try {
    const requests = await MaintenanceRequest.findEmergencyRequests();
    
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error getting emergency requests: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get statistics by property
 * GET /api/maintenance-requests/stats/property/:propertyId
 */
exports.getStatsByProperty = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await MaintenanceRequest.getStatsByProperty(
      req.params.propertyId,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting stats by property: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = exports;
