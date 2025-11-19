const User = require('../models/user.model');
const Lease = require('../models/lease.model');
const Property = require('../models/property.model');
const logger = require('../utils/logger');

// Get tenant profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-password -verificationCode -codeExpires')
      .populate('currentPropertyId')
      .populate('currentLeaseId');
    
    if (!user) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json({
      id: user._id,
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phone,
      currentPropertyId: user.currentPropertyId,
      currentLeaseId: user.currentLeaseId,
      emergencyContact: user.emergencyContact || {},
      preferences: user.preferences || {
        notifications: true,
        autoPayEnabled: false
      }
    });
  } catch (error) {
    logger.error('Error fetching tenant profile:', error);
    res.status(500).json({ error: 'Failed to fetch tenant profile' });
  }
};

// Get tenant statistics
exports.getTenantStats = async (req, res) => {
  try {
    const tenantId = req.params.tenantId || req.user.id;
    
    // TODO: Implement actual statistics calculation
    res.json({
      totalPayments: 0,
      pendingPayments: 0,
      maintenanceRequests: 0,
      leaseEndDate: null
    });
  } catch (error) {
    logger.error('Error fetching tenant stats:', error);
    res.status(500).json({ error: 'Failed to fetch tenant statistics' });
  }
};

module.exports = exports;
