const User = require('../models/user.model');
const Lease = require('../models/lease.model');
const Property = require('../models/property.model');
const logger = require('../utils/logger');

// Get tenant profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // These refs are not present on every user schema version — tolerate
    // their absence instead of erroring (StrictPopulateError).
    const user = await User.findById(userId)
      .select('-password -verificationCode -codeExpires')
      .populate({ path: 'currentPropertyId', strictPopulate: false })
      .populate({ path: 'currentLeaseId', strictPopulate: false });
    
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

// Get current rent status for the authenticated tenant.
// Returns the active lease details (amount, due date, property) or 404 if
// there is no active lease.
exports.getCurrentRent = async (req, res) => {
  try {
    const tenantId = req.user.id;

    const lease = await Lease.findOne({ tenant: tenantId, status: 'active' })
      .populate('property', 'name rent address landlord')
      .lean();

    if (!lease) {
      return res.status(404).json({
        error: 'No active lease found',
        message: 'You do not have an active lease. Contact your landlord or property manager.'
      });
    }

    const today = new Date();
    const dueDate = lease.nextPaymentDate || lease.rentDueDate;
    const isOverdue = dueDate ? new Date(dueDate) < today : false;

    res.json({
      amount: lease.rentAmount || lease.property?.rent?.amount || 0,
      dueDate: dueDate ? new Date(dueDate).toISOString().split('T')[0] : null,
      status: isOverdue ? 'overdue' : 'due',
      propertyId: lease.property?._id,
      propertyName: lease.property?.name,
      landlordId: lease.property?.landlord || lease.landlord,
      lastPaymentDate: lease.lastPaymentDate || null,
      autopayEnabled: lease.autopayEnabled || false,
      nextAutopayDate: lease.nextAutopayDate || null,
      nextAutopayAmount: lease.nextAutopayAmount || null,
    });
  } catch (error) {
    logger.error('Error fetching current rent:', error);
    res.status(500).json({ error: 'Failed to fetch current rent status' });
  }
};

module.exports = exports;
