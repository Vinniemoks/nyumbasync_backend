/**
 * Tenant Journey Controller
 * Manages the 7-stage tenant journey pipeline
 */

const { Contact, Property, Transaction } = require('../models');
const MaintenanceRequest = require('../models/maintenance-request.model');
const logger = require('../utils/logger');

/**
 * Get tenant journey dashboard
 * GET /api/tenant-journey/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const stats = await Contact.getTenantJourneyStats();
    
    const prospects = await Contact.findProspects();
    const applicants = await Contact.findApplicants();
    const activeTenants = await Contact.findActiveTenants();
    const moveOutNotices = await Contact.findTenantsWithMoveOutNotice();
    
    res.json({
      success: true,
      data: {
        stats,
        counts: {
          prospects: prospects.length,
          applicants: applicants.length,
          activeTenants: activeTenants.length,
          moveOutNotices: moveOutNotices.length
        },
        recentProspects: prospects.slice(0, 5),
        pendingApplications: applicants.slice(0, 5),
        upcomingMoveOuts: moveOutNotices.slice(0, 5)
      }
    });
  } catch (error) {
    logger.error(`Error getting tenant journey dashboard: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get contacts by journey stage
 * GET /api/tenant-journey/stage/:stage
 */
exports.getByStage = async (req, res) => {
  try {
    const { stage } = req.params;
    const contacts = await Contact.findByJourneyStage(stage)
      .populate('tenantJourney.prospectInfo.interestedProperties', 'title address rent')
      .populate('assignedTo', 'firstName lastName email');
    
    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    logger.error(`Error getting contacts by stage: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Move contact to new journey stage
 * PUT /api/tenant-journey/:contactId/stage
 */
exports.moveToStage = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { stage, notes } = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.moveToJourneyStage(stage, notes, req.user?._id);
    
    logger.info(`Contact ${contactId} moved to stage: ${stage}`);
    
    res.json({
      success: true,
      message: 'Stage updated successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error moving to stage: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Submit application
 * POST /api/tenant-journey/:contactId/submit-application
 */
exports.submitApplication = async (req, res) => {
  try {
    const { contactId } = req.params;
    const applicationData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.submitApplication(applicationData);
    
    logger.info(`Application submitted for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Application submitted successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error submitting application: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Approve application
 * POST /api/tenant-journey/:contactId/approve
 */
exports.approveApplication = async (req, res) => {
  try {
    const { contactId } = req.params;
    const approvalData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.approveApplication(approvalData, req.user?._id);
    
    logger.info(`Application approved for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Application approved successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error approving application: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Reject application
 * POST /api/tenant-journey/:contactId/reject
 */
exports.rejectApplication = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.rejectApplication(reason, req.user?._id);
    
    logger.info(`Application rejected for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Application rejected',
      data: contact
    });
  } catch (error) {
    logger.error(`Error rejecting application: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Activate lease
 * POST /api/tenant-journey/:contactId/activate-lease
 */
exports.activateLease = async (req, res) => {
  try {
    const { contactId } = req.params;
    const leaseData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.activateLease(leaseData);
    
    logger.info(`Lease activated for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Lease activated successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error activating lease: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Record rent payment
 * POST /api/tenant-journey/:contactId/rent-payment
 */
exports.recordRentPayment = async (req, res) => {
  try {
    const { contactId } = req.params;
    const paymentData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.recordRentPayment(paymentData);
    
    logger.info(`Rent payment recorded for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Rent payment recorded successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error recording rent payment: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Submit move-out notice
 * POST /api/tenant-journey/:contactId/move-out-notice
 */
exports.submitMoveOutNotice = async (req, res) => {
  try {
    const { contactId } = req.params;
    const moveOutData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.submitMoveOutNotice(moveOutData);
    
    logger.info(`Move-out notice submitted for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Move-out notice submitted successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error submitting move-out notice: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Close tenancy
 * POST /api/tenant-journey/:contactId/close-tenancy
 */
exports.closeTenancy = async (req, res) => {
  try {
    const { contactId } = req.params;
    const closureData = req.body;
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    await contact.closeTenancy(closureData, req.user?._id);
    
    logger.info(`Tenancy closed for contact ${contactId}`);
    
    res.json({
      success: true,
      message: 'Tenancy closed successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error closing tenancy: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get late rent payments
 * GET /api/tenant-journey/late-payments
 */
exports.getLatePayments = async (req, res) => {
  try {
    const latePayments = await Contact.findLateRentPayments();
    
    res.json({
      success: true,
      count: latePayments.length,
      data: latePayments
    });
  } catch (error) {
    logger.error(`Error getting late payments: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get pending applications
 * GET /api/tenant-journey/pending-applications
 */
exports.getPendingApplications = async (req, res) => {
  try {
    const pendingApplications = await Contact.findPendingApplications();
    
    res.json({
      success: true,
      count: pendingApplications.length,
      data: pendingApplications
    });
  } catch (error) {
    logger.error(`Error getting pending applications: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = exports;
