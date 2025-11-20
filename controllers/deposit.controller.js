const DepositRefund = require('../models/deposit-refund.model');
const MoveOutRequest = require('../models/move-out-request.model');
const logger = require('../utils/logger');

// Request deposit refund
exports.requestDepositRefund = async (req, res) => {
  try {
    const userId = req.user.id;
    const { moveOutRequestId, depositAmount, bankDetails } = req.body;
    
    // Verify move-out request exists and belongs to user
    const moveOutRequest = await MoveOutRequest.findOne({
      _id: moveOutRequestId,
      tenant: userId
    });
    
    if (!moveOutRequest) {
      return res.status(404).json({ error: 'Move-out request not found' });
    }
    
    // Check if refund already requested
    const existingRefund = await DepositRefund.findOne({ moveOutRequest: moveOutRequestId });
    if (existingRefund) {
      return res.status(400).json({ error: 'Deposit refund already requested' });
    }
    
    const refundRequest = await DepositRefund.create({
      moveOutRequest: moveOutRequestId,
      tenant: userId,
      property: moveOutRequest.property,
      lease: moveOutRequest.lease,
      depositAmount,
      refundAmount: depositAmount, // Will be recalculated after deductions
      bankDetails,
      status: 'submitted',
      stages: [
        { stage: 'submitted', completed: true, timestamp: new Date() }
      ]
    });
    
    res.status(201).json({
      success: true,
      refundRequest
    });
  } catch (error) {
    logger.error('Error requesting deposit refund:', error);
    res.status(500).json({ error: 'Failed to request deposit refund' });
  }
};

// Get deposit refund status
exports.getDepositRefundStatus = async (req, res) => {
  try {
    const { refundId } = req.params;
    const userId = req.user.id;
    
    const refund = await DepositRefund.findOne({
      _id: refundId,
      tenant: userId
    })
      .populate('moveOutRequest')
      .populate('property', 'address unitNumber')
      .populate('approvedBy', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');
    
    if (!refund) {
      return res.status(404).json({ error: 'Deposit refund not found' });
    }
    
    res.json(refund);
  } catch (error) {
    logger.error('Error fetching deposit refund status:', error);
    res.status(500).json({ error: 'Failed to fetch deposit refund status' });
  }
};

// Get current deposit refund
exports.getCurrentDepositRefund = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const refund = await DepositRefund.findOne({
      tenant: userId,
      status: { $in: ['submitted', 'inspection', 'approved', 'processing'] }
    })
      .populate('moveOutRequest')
      .populate('property', 'address unitNumber')
      .sort('-createdAt');
    
    res.json(refund);
  } catch (error) {
    logger.error('Error fetching current deposit refund:', error);
    res.status(500).json({ error: 'Failed to fetch current deposit refund' });
  }
};

module.exports = exports;
