const User = require('../models/user.model');
const Property = require('../models/property.model'); 
const Transaction = require('../models/transaction.model');
const Lease = require('../models/lease.model');
const { sendEmail } = require('../services/email.service');
const { sendSMS } = require('../services/sms.service'); 
const { generateReport } = require('../services/report.service');
const { logAdminActivity } = require('../utils/logger');
const logger = require('../utils/logger');

/**
 * Admin Dashboard Statistics
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Kenyan timezone (Africa/Nairobi)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const Maintenance = require('../models/maintenance.model');

    const countRole = (role) =>
      User.countDocuments({ $or: [{ role }, { roles: role }] });

    const monthlySum = (from, to) =>
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: to ? { $gte: from, $lt: to } : { $gte: from } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((r) => r[0]?.total || 0);

    const [
      users, activeUsers, properties, occupiedProperties,
      transactions, monthlyRevenue, prevMonthlyRevenue, activeLeases,
      tenants, landlords, managers, agents, vendors,
      pendingMaintenance, totalMaintenance, completedMaintenance,
      newUsersThisMonth, newUsersPrevMonth,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      Property.countDocuments(),
      Property.countDocuments({ status: 'occupied' }),
      Transaction.countDocuments({ status: 'completed', createdAt: { $gte: startOfMonth } }),
      monthlySum(startOfMonth),
      monthlySum(startOfPrevMonth, startOfMonth),
      Lease.countDocuments({ status: 'active', endDate: { $gte: new Date() } }),
      countRole('tenant'), countRole('landlord'), countRole('manager'),
      countRole('agent'), countRole('vendor'),
      Maintenance.countDocuments({ status: { $in: ['reported', 'assigned', 'in_progress'] } }),
      Maintenance.countDocuments(),
      Maintenance.countDocuments({ status: 'completed' }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ createdAt: { $gte: startOfPrevMonth, $lt: startOfMonth } }),
    ]);

    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
    const growth = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);

    res.json({
      stats: {
        totalUsers: users,
        activeUsers,
        totalProperties: properties,
        occupancyRate: pct(occupiedProperties, properties),
        monthlyTransactions: transactions,
        monthlyRevenue,
        revenueGrowth: growth(monthlyRevenue, prevMonthlyRevenue),
        userGrowth: growth(newUsersThisMonth, newUsersPrevMonth),
        activeLeases,
        activeTenants: tenants,
        activeLandlords: landlords,
        activeManagers: managers,
        activeAgents: agents,
        activeVendors: vendors,
        pendingMaintenance,
        maintenanceResolutionRate: pct(completedMaintenance, totalMaintenance),
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
/**
 * User administration (list / create / edit) and the login audit trail.
 * Route guards allow admin+super_admin; anything touching admin-level
 * roles additionally requires the requester to be a super_admin.
 */

const LoginAudit = require('../models/login-audit.model');
const { formatKenyanPhone } = require('../utils/formatters');

const ADMIN_LEVEL_ROLES = [
  'admin', 'super_admin', 'support_admin', 'finance_admin',
  'operations_admin', 'sales_customer_service_admin', 'viewer'
];
const ASSIGNABLE_ROLES = [
  'tenant', 'landlord', 'agent', 'manager', 'vendor',
  'admin', 'super_admin', 'support_admin', 'finance_admin',
  'operations_admin', 'sales_customer_service_admin', 'viewer'
];

const isSuper = (reqUser) => {
  const roles = Array.isArray(reqUser.roles) ? reqUser.roles : [reqUser.role];
  return roles.includes('super_admin');
};

// GET /admin/users?search=&role=&page=&limit=
exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.role) {
      const roleList = String(req.query.role).split(',').map((r) => r.trim()).filter(Boolean);
      if (roleList.length === 1) {
        filter.$or = [{ role: roleList[0] }, { roles: roleList[0] }];
      } else if (roleList.length > 1) {
        filter.$or = [
          { role: { $in: roleList } },
          { roles: { $in: roleList } }
        ];
      }
    }
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ email: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }] }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('email phone accountNumber firstName lastName role roles status isEmailVerified mfaEnabled lastLogin createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list users' });
  }
};

// POST /admin/users — create a user with initial credentials.
exports.createUser = async (req, res) => {
  try {
    const { email, phone, firstName, lastName, password, role, roles } = req.body;
    if (!email || !phone || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, phone, firstName and lastName are required' });
    }

    const requestedRoles = [...new Set((Array.isArray(roles) && roles.length ? roles : [role || 'tenant']).filter(Boolean))];
    const invalid = requestedRoles.filter((r) => !ASSIGNABLE_ROLES.includes(r));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid role(s): ${invalid.join(', ')}` });
    }
    // Only a super_admin may mint admin-level accounts.
    if (requestedRoles.some((r) => ADMIN_LEVEL_ROLES.includes(r)) && !isSuper(req.user)) {
      return res.status(403).json({ error: 'Only a super admin can create admin accounts' });
    }

    const normalizedPhone = formatKenyanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid Kenyan phone (must start with 2547 or 2541)' });
    }

    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone: normalizedPhone }] });
    if (exists) {
      return res.status(409).json({ error: 'A user with that email or phone already exists' });
    }

    // Use the given password or generate a strong one to hand to the staff
    // member; the model's pre-save hook hashes it.
    const crypto = require('crypto');
    const initialPassword = password || crypto.randomBytes(9).toString('base64url') + '!2b';
    if (initialPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const hashedActivationToken = crypto.createHash('sha256').update(activationToken).digest('hex');

    const user = await User.create({
      email: email.toLowerCase(),
      phone: normalizedPhone,
      firstName,
      lastName,
      password: initialPassword,
      role: requestedRoles[0],
      roles: requestedRoles,
      isEmailVerified: false,
      isAdminProvisioned: true,
      requirePasswordChange: true,
      createdBy: req.user._id,
      activationToken: hashedActivationToken,
      activationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Send activation email
    const emailService = require('../services/email.service');
    const activationUrl = `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/activate?token=${activationToken}`;

    try {
      await emailService.sendEmail(
        user.email,
        'Activate Your NyumbaSync Account - NyumbaSync',
        'account-activation',
        {
          name: user.firstName || 'User',
          activationUrl,
          appUrl: process.env.FRONTEND_URL || 'https://nyumbasync.co.ke',
          year: new Date().getFullYear()
        }
      );
    } catch (emailError) {
      logger.error('Failed to send activation email:', emailError);
    }

    logAdminActivity(req.user._id, 'USER_CREATED', { targetUser: user._id, roles: requestedRoles });

    res.status(201).json({
      message: 'User created',
      user: {
        id: user._id, email: user.email, phone: user.phone,
        firstName: user.firstName, lastName: user.lastName,
        role: user.role, roles: user.roles,
      },
      // Returned exactly once so the admin can hand it over; never stored in plaintext.
      initialPassword: password ? undefined : initialPassword,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
};

// PATCH /admin/users/:userId — edit profile, roles, status, or reset password.
exports.updateUserAdmin = async (req, res) => {
  try {
    const target = await User.findById(req.params.userId).select('+password');
    if (!target) return res.status(404).json({ error: 'User not found' });

    const targetRoles = Array.isArray(target.roles) && target.roles.length ? target.roles : [target.role];
    const requesterSuper = isSuper(req.user);

    // Editing an admin-level account (or granting admin-level roles) is
    // super_admin-only; nobody can edit a super_admin except a super_admin.
    if (targetRoles.some((r) => ADMIN_LEVEL_ROLES.includes(r)) && !requesterSuper) {
      return res.status(403).json({ error: 'Only a super admin can modify admin accounts' });
    }

    const { firstName, lastName, email, phone, role, roles, status, password } = req.body;

    if (roles || role) {
      const newRoles = [...new Set((Array.isArray(roles) && roles.length ? roles : [role]).filter(Boolean))];
      const invalid = newRoles.filter((r) => !ASSIGNABLE_ROLES.includes(r));
      if (invalid.length) return res.status(400).json({ error: `Invalid role(s): ${invalid.join(', ')}` });
      if (newRoles.some((r) => ADMIN_LEVEL_ROLES.includes(r)) && !requesterSuper) {
        return res.status(403).json({ error: 'Only a super admin can grant admin roles' });
      }
      target.roles = newRoles;
      target.role = newRoles[0];
    }

    if (firstName) target.firstName = firstName;
    if (lastName) target.lastName = lastName;
    if (email) target.email = String(email).toLowerCase();
    if (phone) {
      const normalized = formatKenyanPhone(phone);
      if (!normalized) return res.status(400).json({ error: 'Invalid Kenyan phone' });
      target.phone = normalized;
    }
    if (status) {
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      target.status = status;
    }
    if (password) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }
      target.password = password; // hashed by the pre-save hook
    }

    await target.save();
    logAdminActivity(req.user._id, 'USER_UPDATED', { targetUser: target._id, fields: Object.keys(req.body) });

    res.json({
      message: 'User updated',
      user: {
        id: target._id, email: target.email, phone: target.phone,
        firstName: target.firstName, lastName: target.lastName,
        role: target.role, roles: target.roles, status: target.status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
};

// DELETE /admin/users/:userId — hard-delete an account (super-admin only).
exports.deleteUserAdmin = async (req, res) => {
  try {
    if (!isSuper(req.user)) {
      return res.status(403).json({ error: 'Only a super admin can delete accounts' });
    }

    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const targetRoles = Array.isArray(target.roles) && target.roles.length ? target.roles : [target.role];
    if (targetRoles.includes('super_admin')) {
      return res.status(403).json({ error: 'Super admin accounts cannot be deleted' });
    }
    if (String(target._id) === String(req.user._id || req.user.id)) {
      return res.status(403).json({ error: 'You cannot delete your own account' });
    }

    await User.findByIdAndDelete(target._id);
    logAdminActivity(req.user._id, 'USER_DELETED', { targetUser: target._id });

    res.json({ success: true, message: 'User deleted permanently' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
};

// POST /admin/users/:userId/reset-mfa — clear MFA for an account (super-admin only).
exports.resetUserMFA = async (req, res) => {
  try {
    if (!isSuper(req.user)) {
      return res.status(403).json({ error: 'Only a super admin can reset MFA' });
    }

    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    target.mfaEnabled = false;
    target.mfaSecret = undefined;
    target.mfaBackupCodes = undefined;
    target.mfaVerified = false;
    target.mfaEmailEnabled = false;
    await target.save({ validateBeforeSave: false });

    logAdminActivity(req.user._id, 'MFA_RESET', { targetUser: target._id });

    res.json({ success: true, message: 'MFA reset successfully. The user must set it up again on next login.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset MFA', details: error.message });
  }
};

// GET /admin/audit/logins?page=&limit=&success=&identifier=
exports.getLoginAudit = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const filter = {};
    if (req.query.success === 'true') filter.success = true;
    if (req.query.success === 'false') filter.success = false;
    if (req.query.identifier) filter.identifier = String(req.query.identifier).toLowerCase();

    const [entries, total] = await Promise.all([
      LoginAudit.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      LoginAudit.countDocuments(filter),
    ]);

    res.json({ entries, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load login audit' });
  }
};
