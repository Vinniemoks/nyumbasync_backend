/**
 * Tenant Portal Authentication Middleware
 */

const TenantPortalAuth = require('../models/tenant-portal-auth.model');
const { Contact } = require('../models');
const logger = require('../utils/logger');

/**
 * Authenticate tenant portal session
 */
exports.authenticateTenant = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    const sessionToken = authHeader.replace('Bearer ', '');

    // Find auth record with valid session
    const auths = await TenantPortalAuth.find({ isActive: true });
    
    let validAuth = null;
    for (const auth of auths) {
      if (auth.validateSession(sessionToken)) {
        validAuth = auth;
        await auth.save(); // Save updated lastActivityAt
        break;
      }
    }

    if (!validAuth) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session. Please log in again.'
      });
    }

    // Get contact
    const contact = await Contact.findById(validAuth.contact);
    
    if (!contact || contact.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account not found or inactive'
      });
    }

    // Attach to request
    req.tenantContact = contact;
    req.tenantAuth = validAuth;
    req.sessionToken = sessionToken;

    next();

  } catch (error) {
    logger.error(`Tenant authentication error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Require email verification
 */
exports.requireEmailVerification = (req, res, next) => {
  if (!req.tenantContact?.tenantPortal?.emailVerified) {
    return res.status(403).json({
      success: false,
      error: 'Email verification required. Please verify your email to continue.'
    });
  }
  next();
};

/**
 * Require linked lease
 */
exports.requireLinkedLease = (req, res, next) => {
  const hasLinkedLease = req.tenantContact?.tenantPortal?.linkedLeases?.some(
    ll => ll.status === 'active'
  );

  if (!hasLinkedLease) {
    return res.status(403).json({
      success: false,
      error: 'No active lease found. Please link your lease using the verification code.'
    });
  }
  next();
};

/**
 * Require completed profile
 */
exports.requireCompletedProfile = (req, res, next) => {
  if (!req.tenantContact?.tenantPortal?.profileCompletedAt) {
    return res.status(403).json({
      success: false,
      error: 'Profile completion required. Please complete your profile to continue.'
    });
  }
  next();
};

/**
 * Optional authentication (doesn't fail if not authenticated)
 */
exports.optionalTenantAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const sessionToken = authHeader.replace('Bearer ', '');

    const auths = await TenantPortalAuth.find({ isActive: true });
    
    for (const auth of auths) {
      if (auth.validateSession(sessionToken)) {
        const contact = await Contact.findById(auth.contact);
        if (contact && contact.status === 'active') {
          req.tenantContact = contact;
          req.tenantAuth = auth;
          req.sessionToken = sessionToken;
          await auth.save();
        }
        break;
      }
    }

    next();

  } catch (error) {
    logger.error(`Optional tenant auth error: ${error.message}`);
    next(); // Continue even if error
  }
};

module.exports = exports;
