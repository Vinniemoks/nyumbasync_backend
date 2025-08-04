const User = require('../models/user.model');
const Property = require('../../models/property.model'); 
const Transaction = require('../../models/transaction.model');
const Lease = require('../../models/lease.model');
const { sendEmail } = require('../../services/email.service');
const { sendSMS } = require('../../services/sms.service'); 
const { generateReport } = require('../../services/report.service');
const { logAdminActivity } = require('../../utils/logger');

/**
 * Admin Dashboard Statistics
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Kenyan timezone (Africa/Nairobi)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [users, properties, transactions, revenue, activeLeases] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments({ 
        status: 'completed',
        createdAt: { $gte: startOfMonth }
      }),
      Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]),
      Lease.countDocuments({ 
        status: 'active',
        endDate: { $gte: new Date() }
      })
    ]);

    res.json({
      stats: {
        totalUsers: users,
        totalProperties: properties,
        monthlyTransactions: transactions,
        monthlyRevenue: revenue[0]?.total || 0,
        activeLeases: activeLeases,
        currency: 'KES'
      },
      lastUpdated: now.toISOString()
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'DASHBOARD_FETCH_FAILED', error.message);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
};

/**
 * Lease Management Functions
 */

// Get all leases with filtering options
exports.getLeases = async (req, res) => {
  try {
    const { status, propertyId, tenantId, landlordId } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (propertyId) filter.property = propertyId;
    if (tenantId) filter.tenant = tenantId;
    if (landlordId) filter.landlord = landlordId;

    const leases = await Lease.find(filter)
      .populate('property', 'name location')
      .populate('tenant', 'name phone')
      .populate('landlord', 'name phone');

    res.json({
      count: leases.length,
      leases
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEASE_FETCH_FAILED', error.message);
    res.status(500).json({ error: 'Failed to fetch leases' });
  }
};

// Create a new lease (admin override)
exports.createLease = async (req, res) => {
  try {
    const { propertyId, tenantId, startDate, endDate, rentAmount, paymentCycle } = req.body;

    // Validate required fields
    if (!propertyId || !tenantId || !startDate || !endDate || !rentAmount || !paymentCycle) {
      return res.status(400).json({ error: 'Missing required lease fields' });
    }

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Check if tenant exists
    const tenant = await User.findById(tenantId);
    if (!tenant || tenant.role !== 'tenant') {
      return res.status(404).json({ error: 'Tenant not found or invalid role' });
    }

    // Create lease
    const lease = new Lease({
      property: propertyId,
      tenant: tenantId,
      landlord: property.owner,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      rentAmount,
      paymentCycle,
      status: 'active',
      createdBy: req.user._id,
      isAdminCreated: true
    });

    await lease.save();

    // Update property status to occupied
    await Property.findByIdAndUpdate(propertyId, { status: 'occupied' });

    // Log admin action
    logAdminActivity(req.user._id, 'LEASE_CREATED', { leaseId: lease._id });

    res.status(201).json({
      message: 'Lease created successfully',
      lease
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEASE_CREATION_FAILED', error.message);
    res.status(500).json({ error: 'Failed to create lease' });
  }
};

// Update lease details
exports.updateLease = async (req, res) => {
  try {
    const { leaseId } = req.params;
    const updates = req.body;

    // Validate lease exists
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    // Prevent certain fields from being updated
    const restrictedFields = ['property', 'tenant', 'landlord', 'createdBy'];
    for (const field of restrictedFields) {
      if (updates[field]) {
        return res.status(400).json({ 
          error: `Cannot update ${field} directly` 
        });
      }
    }

    // If updating dates, validate the sequence
    if (updates.startDate || updates.endDate) {
      const newStartDate = updates.startDate ? new Date(updates.startDate) : lease.startDate;
      const newEndDate = updates.endDate ? new Date(updates.endDate) : lease.endDate;
      
      if (newStartDate >= newEndDate) {
        return res.status(400).json({ 
          error: 'End date must be after start date' 
        });
      }
    }

    // Apply updates
    const updatedLease = await Lease.findByIdAndUpdate(
      leaseId,
      updates,
      { new: true }
    );

    // Log admin action
    logAdminActivity(req.user._id, 'LEASE_UPDATED', { 
      leaseId: lease._id,
      updates: Object.keys(updates) 
    });

    res.json({
      message: 'Lease updated successfully',
      lease: updatedLease
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEASE_UPDATE_FAILED', error.message);
    res.status(500).json({ error: 'Failed to update lease' });
  }
};

// Terminate a lease
exports.terminateLease = async (req, res) => {
  try {
    const { leaseId } = req.params;
    const { terminationReason } = req.body;

    if (!terminationReason) {
      return res.status(400).json({ error: 'Termination reason is required' });
    }

    // Find and update lease
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    if (lease.status === 'terminated') {
      return res.status(400).json({ error: 'Lease is already terminated' });
    }

    lease.status = 'terminated';
    lease.terminationDate = new Date();
    lease.terminationReason = terminationReason;
    lease.terminatedBy = req.user._id;
    await lease.save();

    // Update property status to available
    await Property.findByIdAndUpdate(lease.property, { status: 'available' });

    // Notify tenant and landlord
    const [tenant, landlord] = await Promise.all([
      User.findById(lease.tenant),
      User.findById(lease.landlord)
    ]);

    const notificationMessage = `Your lease at ${lease.property.name} has been terminated. Reason: ${terminationReason}`;

    await Promise.all([
      sendSMS({ to: tenant.phone, message: notificationMessage }),
      sendSMS({ to: landlord.phone, message: notificationMessage }),
      tenant.email && sendEmail({
        to: tenant.email,
        subject: 'Lease Termination Notice',
        text: notificationMessage
      }),
      landlord.email && sendEmail({
        to: landlord.email,
        subject: 'Lease Termination Notice',
        text: notificationMessage
      })
    ]);

    // Log admin action
    logAdminActivity(req.user._id, 'LEASE_TERMINATED', { 
      leaseId: lease._id,
      reason: terminationReason 
    });

    res.json({
      message: 'Lease terminated successfully',
      lease
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEASE_TERMINATION_FAILED', error.message);
    res.status(500).json({ error: 'Failed to terminate lease' });
  }
};

// Renew a lease
exports.renewLease = async (req, res) => {
  try {
    const { leaseId } = req.params;
    const { newEndDate, newRentAmount } = req.body;

    if (!newEndDate) {
      return res.status(400).json({ error: 'New end date is required' });
    }

    // Find and update lease
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    if (lease.status !== 'active') {
      return res.status(400).json({ error: 'Only active leases can be renewed' });
    }

    const parsedNewEndDate = new Date(newEndDate);
    if (parsedNewEndDate <= lease.endDate) {
      return res.status(400).json({ 
        error: 'New end date must be after current end date' 
      });
    }

    // Create a new lease record for renewal
    const renewedLease = new Lease({
      property: lease.property,
      tenant: lease.tenant,
      landlord: lease.landlord,
      startDate: lease.endDate,
      endDate: parsedNewEndDate,
      rentAmount: newRentAmount || lease.rentAmount,
      paymentCycle: lease.paymentCycle,
      status: 'active',
      previousLease: lease._id,
      createdBy: req.user._id,
      isAdminCreated: true
    });

    await renewedLease.save();

    // Update old lease
    lease.renewedBy = renewedLease._id;
    lease.status = 'completed';
    await lease.save();

    // Notify tenant and landlord
    const [tenant, landlord] = await Promise.all([
      User.findById(lease.tenant),
      User.findById(lease.landlord)
    ]);

    const notificationMessage = `Your lease at ${lease.property.name} has been renewed until ${newEndDate}.`;

    await Promise.all([
      sendSMS({ to: tenant.phone, message: notificationMessage }),
      sendSMS({ to: landlord.phone, message: notificationMessage }),
      tenant.email && sendEmail({
        to: tenant.email,
        subject: 'Lease Renewal Confirmation',
        text: notificationMessage
      }),
      landlord.email && sendEmail({
        to: landlord.email,
        subject: 'Lease Renewal Confirmation',
        text: notificationMessage
      })
    ]);

    // Log admin action
    logAdminActivity(req.user._id, 'LEASE_RENEWED', { 
      originalLeaseId: lease._id,
      newLeaseId: renewedLease._id 
    });

    res.status(201).json({
      message: 'Lease renewed successfully',
      originalLease: lease,
      renewedLease
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEASE_RENEWAL_FAILED', error.message);
    res.status(500).json({ error: 'Failed to renew lease' });
  }
};

/**
 * User Management
 */
exports.manageUsers = async (req, res) => {
  try {
    const { action, userId, role, status } = req.body;
    
    const validActions = ['change-role', 'update-status'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Kenyan admin validation
    if (user.phone.startsWith('254') && !req.user.isSuperAdmin) {
      return res.status(403).json({ 
        error: 'Elevated privileges required for Kenyan user modifications' 
      });
    }

    let update = {};
    if (action === 'change-role') {
      if (!['tenant', 'landlord', 'vendor', 'manager'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      update.role = role;
    } else {
      if (!['active', 'suspended', 'inactive'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      update.status = status;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true }
    ).select('-password');

    // Log admin action
    logAdminActivity(
      req.user._id, 
      action.toUpperCase(), 
      { targetUser: userId, changes: update }
    );

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'USER_MANAGEMENT_FAILED', error.message);
    res.status(500).json({ error: 'User management action failed' });
  }
};

/**
 * Property Compliance Checks
 */
exports.checkCompliance = async (req, res) => {
  try {
    // Kenyan compliance requirements
    const nonCompliantProperties = await Property.find({
      $or: [
        { 'documents.kraPin': { $exists: false } },
        { 'documents.businessPermit': { $exists: false } },
        { 'documents.insurance': { $exists: false } }
      ]
    }).populate('landlord', 'name phone');

    res.json({
      count: nonCompliantProperties.length,
      nonCompliantProperties,
      requirements: [
        'KRA Pin Certificate',
        'Business Permit',
        'Insurance Coverage'
      ]
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'COMPLIANCE_CHECK_FAILED', error.message);
    res.status(500).json({ error: 'Compliance check failed' });
  }
};

/**
 * Send Legal Notices
 */
exports.sendLegalNotices = async (req, res) => {
  try {
    const { noticeType, recipients, message } = req.body;
    
    // Validate notice types for Kenyan context
    const validNotices = [
      'rent-reminder', 
      'compliance-warning',
      'account-suspension'
    ];
    
    if (!validNotices.includes(noticeType)) {
      return res.status(400).json({ error: 'Invalid notice type' });
    }

    // Process recipients
    const users = await User.find({
      _id: { $in: recipients },
      role: { $in: ['landlord', 'tenant'] }
    });

    // Send notices (SMS + Email)
    const noticeResults = await Promise.all(
      users.map(async user => {
        try {
          // Send SMS (Kenyan format)
          await sendSMS({
            to: user.phone,
            message: `NYUMBASYNC NOTICE: ${message}`
          });

          // Send email
          if (user.email) {
            await sendEmail({
              to: user.email,
              subject: `Legal Notice: ${noticeType.replace('-', ' ')}`,
              text: message
            });
          }

          return { userId: user._id, status: 'sent' };
        } catch (error) {
          return { userId: user._id, status: 'failed', error: error.message };
        }
      })
    );

    // Log notice issuance
    logAdminActivity(
      req.user._id, 
      'LEGAL_NOTICE_SENT', 
      { noticeType, recipients: recipients.length }
    );

    res.json({
      message: 'Notices processed',
      results: noticeResults
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'LEGAL_NOTICE_FAILED', error.message);
    res.status(500).json({ error: 'Failed to send notices' });
  }
};

/**
 * Generate Financial Reports
 */
exports.generateFinancialReport = async (req, res) => {
  try {
    const { startDate, endDate, reportType } = req.query;
    
    // Validate report types
    const validReports = [
      'rent-collection', 
      'landlord-payments',
      'service-charges'
    ];
    
    if (!validReports.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    // Date validation (Kenyan timezone)
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Generate report
    const report = await generateReport(reportType, dateFilter);

    res.json({
      reportType,
      period: { startDate, endDate },
      currency: 'KES',
      ...report
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'REPORT_GENERATION_FAILED', error.message);
    res.status(500).json({ error: 'Report generation failed' });
  }
};

/**
 * System Maintenance
 */
exports.systemMaintenance = async (req, res) => {
  try {
    const { action } = req.body;

    // Validate actions
    const validActions = [
      'backup-database',
      'clear-cache',
      'send-reminders'
    ];

    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid maintenance action' });
    }

    let result;
    switch (action) {
      case 'backup-database':
        result = await databaseBackup();
        break;
      case 'clear-cache':
        result = await clearApplicationCache();
        break;
      case 'send-reminders':
        result = await sendRentReminders();
        break;
    }

    logAdminActivity(req.user._id, 'SYSTEM_MAINTENANCE', { action });
    res.json({
      message: 'Maintenance action completed',
      action,
      result
    });

  } catch (error) {
    logAdminActivity(req.user._id, 'MAINTENANCE_FAILED', error.message);
    res.status(500).json({ error: 'Maintenance action failed' });
  }
};