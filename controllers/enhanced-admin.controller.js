const AdminUser = require('../models/admin-user.model');
const AdminRole = require('../models/admin-role.model');
const { generateToken } = require('../utils/auth');
const { logAdminActivity } = require('../utils/logger');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Admin User Management
exports.createAdmin = async (req, res) => {
  try {
    const { email, password, roleId, allowedIPs } = req.body;

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }

    // Validate role
    const role = await AdminRole.findById(roleId);
    if (!role) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Create admin user
    const adminUser = await AdminUser.create({
      email,
      password,
      role: roleId,
      allowedIPs: allowedIPs || []
    });

    // Log activity
    await logAdminActivity(req.user._id, 'ADMIN_CREATED', {
      createdAdminId: adminUser._id,
      role: role.name
    });

    res.status(201).json({
      message: 'Admin user created successfully',
      adminUser: {
        id: adminUser._id,
        email: adminUser.email,
        role: role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create admin user' });
  }
};

// Enable 2FA
exports.enable2FA = async (req, res) => {
  try {
    const adminUser = await AdminUser.findById(req.user._id);
    
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `NyumbaSync:${adminUser.email}`
    });

    // Save secret
    adminUser.twoFactorSecret = secret.base32;
    adminUser.twoFactorEnabled = false; // Will be enabled after verification
    await adminUser.save();

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      message: '2FA setup initiated',
      qrCode: qrCodeUrl,
      secret: secret.base32
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
};

// Verify 2FA
exports.verify2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const adminUser = await AdminUser.findById(req.user._id)
      .select('+twoFactorSecret');

    const verified = speakeasy.totp.verify({
      secret: adminUser.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    adminUser.twoFactorEnabled = true;
    await adminUser.save();

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
};

// Admin Login with 2FA
exports.loginWith2FA = async (req, res) => {
  try {
    const { email, password, token } = req.body;
    const adminUser = await AdminUser.findOne({ email })
      .select('+password +twoFactorSecret')
      .populate('role');

    if (!adminUser || !(await adminUser.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if IP is allowed
    if (!adminUser.isIPAllowed(req.ip)) {
      await logAdminActivity(adminUser._id, 'LOGIN_FAILED', {
        reason: 'IP not allowed',
        ip: req.ip
      });
      return res.status(403).json({ error: 'Access denied from this IP' });
    }

    // Verify 2FA if enabled
    if (adminUser.twoFactorEnabled) {
      const verified = speakeasy.totp.verify({
        secret: adminUser.twoFactorSecret,
        encoding: 'base32',
        token
      });

      if (!verified) {
        await adminUser.handleFailedLogin();
        return res.status(401).json({ error: 'Invalid 2FA token' });
      }
    }

    // Update last login
    adminUser.lastLogin = new Date();
    adminUser.loginAttempts = 0;
    await adminUser.save();

    // Generate JWT
    const jwtToken = generateToken(adminUser);

    // Log successful login
    await logAdminActivity(adminUser._id, 'LOGIN_SUCCESS', {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      token: jwtToken,
      admin: {
        id: adminUser._id,
        email: adminUser.email,
        role: adminUser.role.name,
        permissions: adminUser.role.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

// Update Admin Status
exports.updateAdminStatus = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { status } = req.body;

    const adminUser = await AdminUser.findById(adminId);
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Prevent self-deactivation
    if (adminId === req.user._id && status !== 'active') {
      return res.status(400).json({ error: 'Cannot deactivate own account' });
    }

    adminUser.status = status;
    await adminUser.save();

    await logAdminActivity(req.user._id, 'ADMIN_STATUS_UPDATED', {
      targetAdminId: adminId,
      newStatus: status
    });

    res.json({
      message: 'Admin status updated successfully',
      status: adminUser.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin status' });
  }
};

// Get Admin Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { startDate, endDate, action } = req.query;

    const query = { _id: adminId };
    const auditQuery = {};

    if (startDate || endDate) {
      auditQuery['auditLog.timestamp'] = {};
      if (startDate) auditQuery['auditLog.timestamp'].$gte = new Date(startDate);
      if (endDate) auditQuery['auditLog.timestamp'].$lte = new Date(endDate);
    }

    if (action) {
      auditQuery['auditLog.action'] = action;
    }

    const adminUser = await AdminUser.findOne(query)
      .select('email auditLog')
      .populate('role');

    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Filter audit logs based on query
    let auditLogs = adminUser.auditLog;
    if (Object.keys(auditQuery).length > 0) {
      auditLogs = auditLogs.filter(log => {
        let match = true;
        if (auditQuery['auditLog.timestamp']) {
          if (auditQuery['auditLog.timestamp'].$gte) {
            match = match && log.timestamp >= auditQuery['auditLog.timestamp'].$gte;
          }
          if (auditQuery['auditLog.timestamp'].$lte) {
            match = match && log.timestamp <= auditQuery['auditLog.timestamp'].$lte;
          }
        }
        if (auditQuery['auditLog.action']) {
          match = match && log.action === auditQuery['auditLog.action'];
        }
        return match;
      });
    }

    res.json({
      admin: {
        id: adminUser._id,
        email: adminUser.email,
        role: adminUser.role.name
      },
      auditLogs: auditLogs.sort((a, b) => b.timestamp - a.timestamp)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
};

// Role Management
exports.createRole = async (req, res) => {
  try {
    const { name, permissions, description } = req.body;

    const existingRole = await AdminRole.findOne({ name });
    if (existingRole) {
      return res.status(400).json({ error: 'Role already exists' });
    }

    const role = await AdminRole.create({
      name,
      permissions,
      description
    });

    await logAdminActivity(req.user._id, 'ROLE_CREATED', {
      roleName: name,
      permissions
    });

    res.status(201).json({
      message: 'Role created successfully',
      role
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create role' });
  }
};

// Get all roles
exports.getRoles = async (req, res) => {
  try {
    const roles = await AdminRole.find();
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
};

// Update role permissions
exports.updateRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body;

    const role = await AdminRole.findById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    role.permissions = permissions;
    await role.save();

    await logAdminActivity(req.user._id, 'ROLE_UPDATED', {
      roleId,
      newPermissions: permissions
    });

    res.json({
      message: 'Role permissions updated successfully',
      role
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
};

module.exports = exports;