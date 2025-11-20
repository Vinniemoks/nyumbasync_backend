const User = require('../models/user.model');
const LandlordProfile = require('../models/landlord-profile.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');
const Transaction = require('../models/transaction.model');
const MaintenanceRequest = require('../models/maintenance-request.model');
const VendorManagement = require('../models/vendor-management.model');
const Workflow = require('../models/workflow.model');
const Contact = require('../models/contact.model');
const Document = require('../models/document.model');
const AuditLog = require('../models/audit-log.model');
const { sendEmail } = require('../services/email.service');
const { sendSMS } = require('../services/sms.service');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * PHASE 1: Authentication & Onboarding
 */

// Create landlord account (Super Admin only)
exports.createLandlordAccount = async (req, res) => {
  try {
    const { email, phone, firstName, lastName, accountType, assignedProperties } = req.body;
    
    // Validate super admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only super admins can create landlord accounts' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or phone already exists' });
    }
    
    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    
    // Create user
    const user = new User({
      email,
      phone,
      firstName,
      lastName,
      role: 'landlord',
      password: tempPassword,
      status: 'active'
    });
    
    await user.save();
    
    // Create landlord profile
    const profile = new LandlordProfile({
      user: user._id,
      accountType: accountType || 'primary_landlord',
      assignedProperties: assignedProperties || [],
      twoFactorAuth: { enabled: false }
    });
    
    await profile.save();
    
    // Send welcome email with temporary password
    await sendEmail({
      to: email,
      subject: 'Welcome to NyumbaSync - Landlord Portal',
      text: `Your landlord account has been created. 
      
Email: ${email}
Temporary Password: ${tempPassword}

Please log in and change your password immediately. You will also be required to set up two-factor authentication.`
    });
    
    // Log admin action
    await AuditLog.create({
      user: req.user._id,
      action: 'LANDLORD_ACCOUNT_CREATED',
      details: { landlordId: user._id, accountType },
      ipAddress: req.ip
    });
    
    res.status(201).json({
      message: 'Landlord account created successfully',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        accountType: profile.accountType
      }
    });
    
  } catch (error) {
    console.error('Create landlord account error:', error);
    res.status(500).json({ error: 'Failed to create landlord account' });
  }
};

// Setup 2FA
exports.setup2FA = async (req, res) => {
  try {
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    
    if (!profile) {
      return res.status(404).json({ error: 'Landlord profile not found' });
    }
    
    if (profile.twoFactorAuth.enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }
    
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `NyumbaSync (${req.user.email})`,
      length: 32
    });
    
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    // Generate backup codes
    const backupCodes = profile.generateBackupCodes();
    
    // Save secret (not yet enabled)
    profile.twoFactorAuth.secret = secret.base32;
    await profile.save();
    
    res.json({
      message: '2FA setup initiated',
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes
    });
    
  } catch (error) {
    console.error('Setup 2FA error:', error);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
};

// Verify and enable 2FA
exports.verify2FA = async (req, res) => {
  try {
    const { token } = req.body;
    
    const profile = await LandlordProfile.findOne({ user: req.user._id }).select('+twoFactorAuth.secret');
    
    if (!profile || !profile.twoFactorAuth.secret) {
      return res.status(400).json({ error: '2FA setup not initiated' });
    }
    
    // Verify token
    const verified = speakeasy.totp.verify({
      secret: profile.twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2
    });
    
    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Enable 2FA
    profile.twoFactorAuth.enabled = true;
    profile.twoFactorAuth.verifiedAt = new Date();
    await profile.save();
    
    await AuditLog.create({
      user: req.user._id,
      action: '2FA_ENABLED',
      ipAddress: req.ip
    });
    
    res.json({ message: '2FA enabled successfully' });
    
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
};

// Accept service agreement
exports.acceptServiceAgreement = async (req, res) => {
  try {
    const { version, digitalSignature } = req.body;
    
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    
    if (!profile) {
      return res.status(404).json({ error: 'Landlord profile not found' });
    }
    
    profile.serviceAgreement = {
      accepted: true,
      version,
      acceptedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      digitalSignature
    };
    
    await profile.save();
    
    await AuditLog.create({
      user: req.user._id,
      action: 'SERVICE_AGREEMENT_ACCEPTED',
      details: { version },
      ipAddress: req.ip
    });
    
    res.json({ message: 'Service agreement accepted successfully' });
    
  } catch (error) {
    console.error('Accept service agreement error:', error);
    res.status(500).json({ error: 'Failed to accept service agreement' });
  }
};

/**
 * PHASE 2: Portfolio Setup & Property Management
 */

// Register property
exports.registerProperty = async (req, res) => {
  try {
    const propertyData = req.body;
    
    // Set landlord
    propertyData.landlord = req.user._id;
    
    const property = new Property(propertyData);
    await property.save();
    
    // Update portfolio stats
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    if (profile) {
      await profile.updatePortfolioStats();
    }
    
    await AuditLog.create({
      user: req.user._id,
      action: 'PROPERTY_REGISTERED',
      details: { propertyId: property._id },
      ipAddress: req.ip
    });
    
    res.status(201).json({
      message: 'Property registered successfully',
      property
    });
    
  } catch (error) {
    console.error('Register property error:', error);
    res.status(500).json({ error: 'Failed to register property' });
  }
};

// Bulk import properties
exports.bulkImportProperties = async (req, res) => {
  try {
    const { properties } = req.body;
    
    if (!Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ error: 'Invalid properties data' });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const propertyData of properties) {
      try {
        propertyData.landlord = req.user._id;
        const property = new Property(propertyData);
        await property.save();
        results.success.push({ id: property._id, title: property.title });
      } catch (error) {
        results.failed.push({ 
          title: propertyData.title, 
          error: error.message 
        });
      }
    }
    
    // Update portfolio stats
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    if (profile) {
      await profile.updatePortfolioStats();
    }
    
    res.json({
      message: 'Bulk import completed',
      results
    });
    
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to import properties' });
  }
};

// Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { documentType, url } = req.body;
    
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    
    if (!profile) {
      return res.status(404).json({ error: 'Landlord profile not found' });
    }
    
    profile.verification.documents.push({
      type: documentType,
      url,
      uploadedAt: new Date(),
      status: 'pending'
    });
    
    profile.verification.status = 'pending';
    await profile.save();
    
    res.json({ message: 'Document uploaded successfully' });
    
  } catch (error) {
    console.error('Upload verification documents error:', error);
    res.status(500).json({ error: 'Failed to upload documents' });
  }
};

/**
 * PHASE 3: Role-Based Access Control
 */

// Create sub-account
exports.createSubAccount = async (req, res) => {
  try {
    const { email, phone, firstName, lastName, accountType, permissions, assignedProperties } = req.body;
    
    // Check if primary landlord
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    if (profile.accountType !== 'primary_landlord') {
      return res.status(403).json({ error: 'Only primary landlords can create sub-accounts' });
    }
    
    // Create user
    const tempPassword = Math.random().toString(36).slice(-8);
    const user = new User({
      email,
      phone,
      firstName,
      lastName,
      role: 'landlord',
      password: tempPassword
    });
    
    await user.save();
    
    // Create profile
    const subProfile = new LandlordProfile({
      user: user._id,
      accountType,
      permissions: permissions || {},
      assignedProperties: assignedProperties || []
    });
    
    await subProfile.save();
    
    // Send credentials
    await sendEmail({
      to: email,
      subject: 'NyumbaSync Sub-Account Created',
      text: `Your account has been created.
      
Email: ${email}
Temporary Password: ${tempPassword}

Please log in and change your password.`
    });
    
    res.status(201).json({
      message: 'Sub-account created successfully',
      user: { id: user._id, email, accountType }
    });
    
  } catch (error) {
    console.error('Create sub-account error:', error);
    res.status(500).json({ error: 'Failed to create sub-account' });
  }
};

// Update sub-account permissions
exports.updateSubAccountPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions, assignedProperties } = req.body;
    
    const profile = await LandlordProfile.findOne({ user: userId });
    
    if (!profile) {
      return res.status(404).json({ error: 'Sub-account not found' });
    }
    
    if (permissions) {
      profile.permissions = permissions;
    }
    
    if (assignedProperties) {
      profile.assignedProperties = assignedProperties;
    }
    
    await profile.save();
    
    res.json({ message: 'Permissions updated successfully' });
    
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
};

/**
 * PHASE 4: Tenant & Lease Management (CRM)
 */

// Get all contacts with CRM features
exports.getContacts = async (req, res) => {
  try {
    const { stage, search, page = 1, limit = 20 } = req.query;
    
    const query = { landlord: req.user._id };
    
    if (stage) {
      query.stage = stage;
    }
    
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') }
      ];
    }
    
    const contacts = await Contact.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Contact.countDocuments(query);
    
    res.json({
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

// Create lease from template
exports.createLeaseFromTemplate = async (req, res) => {
  try {
    const { tenantId, propertyId, templateId, customTerms } = req.body;
    
    const lease = new Lease({
      tenant: tenantId,
      property: propertyId,
      landlord: req.user._id,
      template: templateId,
      terms: customTerms,
      status: 'draft'
    });
    
    await lease.save();
    
    res.status(201).json({
      message: 'Lease created from template',
      lease
    });
    
  } catch (error) {
    console.error('Create lease error:', error);
    res.status(500).json({ error: 'Failed to create lease' });
  }
};

/**
 * PHASE 5: Financial Management
 */

// Get financial dashboard
exports.getFinancialDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    // Get properties
    const properties = await Property.find({ landlord: req.user._id });
    const propertyIds = properties.map(p => p._id);
    
    // Get transactions
    const transactions = await Transaction.find({
      property: { $in: propertyIds },
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
    });
    
    // Calculate metrics
    const income = transactions
      .filter(t => t.type === 'rent' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = transactions
      .filter(t => t.type === 'expense' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const noi = income - expenses;
    
    // Get occupancy rate
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    
    res.json({
      summary: {
        totalIncome: income,
        totalExpenses: expenses,
        netOperatingIncome: noi,
        occupancyRate: profile?.occupancyRate || 0,
        totalProperties: properties.length
      },
      properties: properties.map(p => ({
        id: p._id,
        title: p.title,
        rent: p.rent.amount,
        status: p.status
      }))
    });
    
  } catch (error) {
    console.error('Get financial dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch financial dashboard' });
  }
};

/**
 * PHASE 6: Maintenance Management
 */

// Get all maintenance requests
exports.getMaintenanceRequests = async (req, res) => {
  try {
    const { status, priority, propertyId, page = 1, limit = 20 } = req.query;
    
    // Get landlord's properties
    const properties = await Property.find({ landlord: req.user._id });
    const propertyIds = properties.map(p => p._id);
    
    const query = { property: { $in: propertyIds } };
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (propertyId) query.property = propertyId;
    
    const requests = await MaintenanceRequest.find(query)
      .populate('property', 'title address')
      .populate('tenant', 'firstName lastName phone')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await MaintenanceRequest.countDocuments(query);
    
    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get maintenance requests error:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
};

// Assign vendor to maintenance request
exports.assignVendor = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { vendorId } = req.body;
    
    const request = await MaintenanceRequest.findById(requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }
    
    request.assignedVendor = vendorId;
    request.status = 'assigned';
    request.assignedAt = new Date();
    await request.save();
    
    // Notify vendor
    const vendor = await VendorManagement.findById(vendorId);
    if (vendor) {
      await sendSMS({
        to: vendor.contact.phone,
        message: `New maintenance request assigned to you. Request ID: ${requestId}`
      });
    }
    
    res.json({ message: 'Vendor assigned successfully', request });
    
  } catch (error) {
    console.error('Assign vendor error:', error);
    res.status(500).json({ error: 'Failed to assign vendor' });
  }
};

/**
 * PHASE 7: Automation & Workflows
 */

// Create workflow
exports.createWorkflow = async (req, res) => {
  try {
    const workflowData = req.body;
    workflowData.landlord = req.user._id;
    workflowData.createdBy = req.user._id;
    
    const workflow = new Workflow(workflowData);
    await workflow.save();
    
    res.status(201).json({
      message: 'Workflow created successfully',
      workflow
    });
    
  } catch (error) {
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
};

// Get workflows
exports.getWorkflows = async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = { landlord: req.user._id };
    if (status) query.status = status;
    
    const workflows = await Workflow.find(query).sort({ createdAt: -1 });
    
    res.json({ workflows });
    
  } catch (error) {
    console.error('Get workflows error:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
};

// Execute workflow manually
exports.executeWorkflow = async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { context } = req.body;
    
    const workflow = await Workflow.findById(workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const execution = await workflow.execute({
      ...context,
      triggeredBy: req.user._id
    });
    
    res.json({
      message: 'Workflow executed',
      execution
    });
    
  } catch (error) {
    console.error('Execute workflow error:', error);
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
};

/**
 * PHASE 8: Vendor Management
 */

// Create vendor
exports.createVendor = async (req, res) => {
  try {
    const vendorData = req.body;
    vendorData.landlord = req.user._id;
    
    const vendor = new VendorManagement(vendorData);
    await vendor.save();
    
    res.status(201).json({
      message: 'Vendor created successfully',
      vendor
    });
    
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
};

// Get vendors
exports.getVendors = async (req, res) => {
  try {
    const { category, status } = req.query;
    
    const query = { landlord: req.user._id };
    if (category) query.category = category;
    if (status) query.status = status;
    
    const vendors = await VendorManagement.find(query).sort({ isPreferred: -1, 'performance.rating': -1 });
    
    res.json({ vendors });
    
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

/**
 * PHASE 9: Reporting & Analytics
 */

// Get dashboard analytics
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const profile = await LandlordProfile.findOne({ user: req.user._id });
    const properties = await Property.find({ landlord: req.user._id });
    
    // Get recent transactions
    const propertyIds = properties.map(p => p._id);
    const recentTransactions = await Transaction.find({
      property: { $in: propertyIds }
    }).sort({ createdAt: -1 }).limit(10);
    
    // Get maintenance requests
    const maintenanceRequests = await MaintenanceRequest.find({
      property: { $in: propertyIds },
      status: { $ne: 'completed' }
    }).countDocuments();
    
    res.json({
      portfolio: profile?.portfolio || {},
      occupancyRate: profile?.occupancyRate || 0,
      totalProperties: properties.length,
      recentTransactions,
      pendingMaintenance: maintenanceRequests
    });
    
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * PHASE 10: Document Management
 */

// Upload document
exports.uploadDocument = async (req, res) => {
  try {
    const { title, category, url, propertyId, tenantId } = req.body;
    
    const document = new Document({
      title,
      category,
      url,
      uploadedBy: req.user._id,
      property: propertyId,
      tenant: tenantId
    });
    
    await document.save();
    
    res.status(201).json({
      message: 'Document uploaded successfully',
      document
    });
    
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Get documents
exports.getDocuments = async (req, res) => {
  try {
    const { category, propertyId, page = 1, limit = 20 } = req.query;
    
    const query = { uploadedBy: req.user._id };
    if (category) query.category = category;
    if (propertyId) query.property = propertyId;
    
    const documents = await Document.find(query)
      .populate('property', 'title')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Document.countDocuments(query);
    
    res.json({
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

module.exports = exports;
