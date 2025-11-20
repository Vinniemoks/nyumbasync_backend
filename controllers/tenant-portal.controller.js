/**
 * Tenant Portal Controller
 * Handles tenant registration, authentication, and profile management
 */

const { Contact, Transaction } = require('../models');
const TenantPortalAuth = require('../models/tenant-portal-auth.model');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Phase 1: Initial Portal Registration
 * POST /api/tenant-portal/register
 */
exports.registerTenant = async (req, res) => {
  try {
    const { email, firstName, lastName, phone, agreeToTerms, agreeToPrivacy } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Email, full name, and phone number are required'
      });
    }

    // Validate terms acceptance
    if (!agreeToTerms || !agreeToPrivacy) {
      return res.status(400).json({
        success: false,
        error: 'You must accept the Terms of Service and Privacy Policy'
      });
    }

    // Check if email already exists
    const existingAuth = await TenantPortalAuth.findByEmail(email);
    if (existingAuth) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Create or find contact
    let contact = await Contact.findOne({ email: email.toLowerCase() });
    
    if (!contact) {
      contact = await Contact.create({
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone,
        primaryRole: 'tenant',
        roles: ['tenant'],
        tags: ['tenant-portal'],
        status: 'active'
      });
    } else {
      // Update existing contact
      contact.firstName = firstName;
      contact.lastName = lastName;
      contact.phone = phone;
      if (!contact.roles.includes('tenant')) {
        contact.roles.push('tenant');
      }
      if (!contact.tags.includes('tenant-portal')) {
        contact.tags.push('tenant-portal');
      }
      await contact.save();
    }

    // Enable portal access
    await contact.enablePortalAccess(email, phone);

    // Create authentication record
    const auth = await TenantPortalAuth.create({
      contact: contact._id,
      email: email.toLowerCase()
    });

    // Accept terms
    await auth.acceptTerms('1.0', '1.0');

    // Generate email verification token
    const verificationToken = auth.generateMagicLink();
    await auth.save();

    // TODO: Send verification email with magic link
    logger.info(`Tenant registration initiated for ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      data: {
        contactId: contact._id,
        email: contact.email,
        requiresEmailVerification: true
      }
    });

  } catch (error) {
    logger.error(`Tenant registration error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
};

/**
 * Verify email with magic link
 * GET /api/tenant-portal/verify-email/:token
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const auth = await TenantPortalAuth.findByMagicToken(token);
    
    if (!auth) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification link'
      });
    }

    // Mark email as verified
    const contact = await Contact.findById(auth.contact);
    await contact.verifyEmail();

    // Clear magic link
    auth.magicLinkToken = undefined;
    auth.magicLinkExpiry = undefined;
    await auth.save();

    logger.info(`Email verified for contact ${contact._id}`);

    res.json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
      data: {
        emailVerified: true
      }
    });

  } catch (error) {
    logger.error(`Email verification error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Verification failed. Please try again.'
    });
  }
};

/**
 * Request login magic link
 * POST /api/tenant-portal/login
 */
exports.requestLogin = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const auth = await TenantPortalAuth.findByEmail(email);
    
    if (!auth) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a login link.'
      });
    }

    // Check if account is locked
    if (auth.isAccountLocked()) {
      return res.status(429).json({
        success: false,
        error: 'Account temporarily locked due to multiple failed attempts. Please try again later.'
      });
    }

    // Generate magic link
    const token = auth.generateMagicLink();
    await auth.save();

    // TODO: Send magic link email
    logger.info(`Login link sent to ${email}`);

    res.json({
      success: true,
      message: 'Login link sent to your email. Please check your inbox.'
    });

  } catch (error) {
    logger.error(`Login request error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Login request failed. Please try again.'
    });
  }
};

/**
 * Authenticate with magic link
 * POST /api/tenant-portal/authenticate/:token
 */
exports.authenticateWithMagicLink = async (req, res) => {
  try {
    const { token } = req.params;
    const { deviceInfo } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const auth = await TenantPortalAuth.findByMagicToken(token);
    
    if (!auth) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired login link'
      });
    }

    // Create session
    const sessionToken = auth.createSession(deviceInfo, ipAddress);
    
    // Clear magic link
    auth.magicLinkToken = undefined;
    auth.magicLinkExpiry = undefined;
    await auth.save();

    // Get contact with linked leases
    const contact = await Contact.findById(auth.contact)
      .populate('tenantPortal.linkedLeases.property', 'title address rent')
      .populate('tenantPortal.linkedLeases.transaction');

    logger.info(`Tenant authenticated: ${contact.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        sessionToken,
        contact: {
          id: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          hasLinkedLeases: contact.tenantPortal?.linkedLeases?.length > 0,
          profileCompleted: !!contact.tenantPortal?.profileCompletedAt
        }
      }
    });

  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Phase 2: Link to Lease with Verification Code
 * POST /api/tenant-portal/link-lease
 */
exports.linkLease = async (req, res) => {
  try {
    const { verificationCode } = req.body;
    const contactId = req.tenantContact._id; // From auth middleware

    if (!verificationCode) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required'
      });
    }

    // Find lease by verification code
    const lease = await Transaction.findByVerificationCode(verificationCode);
    
    if (!lease) {
      return res.status(404).json({
        success: false,
        error: 'Invalid verification code or lease not found'
      });
    }

    // Check if lease is already linked
    const contact = await Contact.findById(contactId);
    const alreadyLinked = contact.tenantPortal?.linkedLeases?.some(
      ll => ll.transaction.toString() === lease._id.toString()
    );

    if (alreadyLinked) {
      return res.status(409).json({
        success: false,
        error: 'This lease is already linked to your account'
      });
    }

    // Link lease to contact
    await contact.linkLease(lease._id, lease.property, verificationCode);
    
    // Update transaction
    await lease.linkTenantContact(contactId);

    logger.info(`Lease ${lease._id} linked to contact ${contactId}`);

    res.json({
      success: true,
      message: 'Lease linked successfully',
      data: {
        lease: {
          id: lease._id,
          property: lease.property,
          status: lease.pipeline.stage
        }
      }
    });

  } catch (error) {
    logger.error(`Lease linking error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to link lease. Please try again.'
    });
  }
};

/**
 * Phase 3: Complete Tenant Profile
 * POST /api/tenant-portal/complete-profile
 */
exports.completeProfile = async (req, res) => {
  try {
    const contactId = req.tenantContact._id;
    const { emergencyContact, occupants, vehicles, preferredCommunicationMethod } = req.body;

    // Validate emergency contact
    if (!emergencyContact || !emergencyContact.name || !emergencyContact.phone) {
      return res.status(400).json({
        success: false,
        error: 'Emergency contact information is required'
      });
    }

    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Complete profile
    await contact.completePortalProfile({
      emergencyContact,
      occupants: occupants || [],
      vehicles: vehicles || [],
      preferredCommunicationMethod: preferredCommunicationMethod || 'portal'
    });

    logger.info(`Profile completed for contact ${contactId}`);

    res.json({
      success: true,
      message: 'Profile completed successfully',
      data: {
        profileCompleted: true,
        completedAt: contact.tenantPortal.profileCompletedAt
      }
    });

  } catch (error) {
    logger.error(`Profile completion error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to complete profile. Please try again.'
    });
  }
};

/**
 * Get tenant profile
 * GET /api/tenant-portal/profile
 */
exports.getProfile = async (req, res) => {
  try {
    const contactId = req.tenantContact._id;

    const contact = await Contact.findById(contactId)
      .populate('tenantPortal.linkedLeases.property', 'title address rent images')
      .populate('tenantPortal.linkedLeases.transaction', 'pipeline.stage financials');

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: contact._id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        emailVerified: contact.tenantPortal?.emailVerified || false,
        phoneVerified: contact.tenantPortal?.phoneVerified || false,
        profileCompleted: !!contact.tenantPortal?.profileCompletedAt,
        linkedLeases: contact.tenantPortal?.linkedLeases || [],
        emergencyContact: contact.tenantPortal?.emergencyContact,
        occupants: contact.tenantPortal?.occupants || [],
        vehicles: contact.tenantPortal?.vehicles || [],
        preferredCommunicationMethod: contact.tenantPortal?.preferredCommunicationMethod || 'portal',
        lastLogin: contact.tenantPortal?.lastLoginAt
      }
    });

  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
};

/**
 * Update tenant profile
 * PUT /api/tenant-portal/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const contactId = req.tenantContact._id;
    const updates = req.body;

    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Update allowed fields
    if (updates.phone) contact.phone = updates.phone;
    if (updates.emergencyContact) {
      contact.tenantPortal.emergencyContact = updates.emergencyContact;
    }
    if (updates.occupants) {
      contact.tenantPortal.occupants = updates.occupants;
    }
    if (updates.vehicles) {
      contact.tenantPortal.vehicles = updates.vehicles;
    }
    if (updates.preferredCommunicationMethod) {
      contact.tenantPortal.preferredCommunicationMethod = updates.preferredCommunicationMethod;
    }

    await contact.save();

    logger.info(`Profile updated for contact ${contactId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    logger.error(`Profile update error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

/**
 * Logout
 * POST /api/tenant-portal/logout
 */
exports.logout = async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    const contactId = req.tenantContact._id;

    const auth = await TenantPortalAuth.findOne({ contact: contactId });
    
    if (auth && sessionToken) {
      await auth.revokeSession(sessionToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};

/**
 * Generate verification code for a lease (Landlord action)
 * POST /api/tenant-portal/generate-code/:transactionId
 */
exports.generateLeaseCode = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    if (transaction.dealType !== 'lease') {
      return res.status(400).json({
        success: false,
        error: 'Verification codes can only be generated for lease transactions'
      });
    }

    await transaction.generateVerificationCode();

    logger.info(`Verification code generated for transaction ${transactionId}`);

    res.json({
      success: true,
      message: 'Verification code generated successfully',
      data: {
        verificationCode: transaction.tenantPortal.verificationCode,
        expiresAt: transaction.tenantPortal.codeExpiresAt
      }
    });

  } catch (error) {
    logger.error(`Code generation error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate verification code'
    });
  }
};

/**
 * Send tenant invitation email (Landlord action)
 * POST /api/tenant-portal/send-invitation/:transactionId
 */
exports.sendTenantInvitation = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const transaction = await Transaction.findById(transactionId)
      .populate('property', 'title address');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Generate code if not exists
    if (!transaction.tenantPortal?.verificationCode) {
      await transaction.generateVerificationCode();
    }

    await transaction.sendTenantInvitation(email);

    // TODO: Send invitation email with verification code
    logger.info(`Tenant invitation sent to ${email} for transaction ${transactionId}`);

    res.json({
      success: true,
      message: 'Invitation sent successfully'
    });

  } catch (error) {
    logger.error(`Invitation sending error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to send invitation'
    });
  }
};

module.exports = exports;
