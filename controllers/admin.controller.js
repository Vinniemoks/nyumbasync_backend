const User = require('../models/user.model');
const Property = require('../../models/property.model');
const Transaction = require('../../models/transaction.model');
const Lease = require('../../models/lease.model');
const { sendEmail } = require('../../services/email.service');
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
    
    const [users, properties, transactions, revenue] = await Promise.all([
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
      ])
    ]);

    res.json({
      stats: {
        totalUsers: users,
        totalProperties: properties,
        monthlyTransactions: transactions,
        monthlyRevenue: revenue[0]?.total || 0,
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
