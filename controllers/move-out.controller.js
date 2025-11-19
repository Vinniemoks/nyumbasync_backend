const MoveOutRequest = require('../models/move-out-request.model');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');
const smsService = require('../services/sms.service');

// Submit move-out request
exports.submitMoveOutRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { propertyId, leaseId, moveOutDate, reason, forwardingAddress } = req.body;
    
    const moveOutRequest = await MoveOutRequest.create({
      tenant: userId,
      property: propertyId,
      lease: leaseId,
      moveOutDate,
      reason,
      forwardingAddress,
      status: 'pending',
      stakeholderNotified: true,
      notifiedAt: new Date()
    });
    
    // Populate for response
    await moveOutRequest.populate('tenant', 'firstName lastName email phone');
    await moveOutRequest.populate('property', 'address unitNumber');
    
    // Send notification to tenant
    try {
      await smsService.sendMoveOutConfirmationSMS(moveOutRequest.tenant, moveOutRequest);
    } catch (error) {
      logger.error('Error sending move-out SMS:', error);
    }
    
    res.status(201).json({
      success: true,
      referenceNumber: moveOutRequest.referenceNumber,
      moveOutRequest: {
        id: moveOutRequest._id,
        referenceNumber: moveOutRequest.referenceNumber,
        propertyId: moveOutRequest.property._id,
        leaseId: moveOutRequest.lease,
        moveOutDate: moveOutRequest.moveOutDate,
        reason: moveOutRequest.reason,
        status: moveOutRequest.status,
        submittedAt: moveOutRequest.createdAt,
        stakeholderNotified: moveOutRequest.stakeholderNotified
      }
    });
  } catch (error) {
    logger.error('Error submitting move-out request:', error);
    res.status(500).json({ error: 'Failed to submit move-out request' });
  }
};

// Get move-out status
exports.getMoveOutStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;
    
    const moveOutRequest = await MoveOutRequest.findOne({
      _id: requestId,
      tenant: userId
    })
      .populate('tenant', 'firstName lastName email phone')
      .populate('property', 'address unitNumber')
      .populate('inspectionScheduled.inspector', 'firstName lastName phone');
    
    if (!moveOutRequest) {
      return res.status(404).json({ error: 'Move-out request not found' });
    }
    
    res.json(moveOutRequest);
  } catch (error) {
    logger.error('Error fetching move-out status:', error);
    res.status(500).json({ error: 'Failed to fetch move-out status' });
  }
};

// Get current move-out request
exports.getCurrentMoveOutRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const moveOutRequest = await MoveOutRequest.findOne({
      tenant: userId,
      status: { $in: ['pending', 'approved', 'inspection_scheduled', 'inspection_completed'] }
    })
      .populate('property', 'address unitNumber')
      .sort('-createdAt');
    
    res.json(moveOutRequest);
  } catch (error) {
    logger.error('Error fetching current move-out request:', error);
    res.status(500).json({ error: 'Failed to fetch current move-out request' });
  }
};

// Cancel move-out request
exports.cancelMoveOutRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;
    
    // TODO: Implement move-out request cancellation
    res.json({
      success: true,
      message: 'Move-out request cancelled'
    });
  } catch (error) {
    logger.error('Error cancelling move-out request:', error);
    res.status(500).json({ error: 'Failed to cancel move-out request' });
  }
};

module.exports = exports;
