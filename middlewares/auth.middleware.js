const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Lease = require('../models/lease.model');
const logger = require('../utils/logger');
const { isBlacklisted } = require('../services/token-blacklist.service');

// Helper function for logging auth attempts
const logAuthAttempt = (identifier, event, details = '') => {
  logger.info(`Auth: ${event} - ${identifier} ${details}`);
};
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiting for authentication attempts
const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 60, // per 60 seconds
});

/**
 * Enhanced JWT authentication middleware with rate limiting
 * @param {string|array} roles - Optional role(s) to authorize
 */
const authenticate = (roles = 'any') => {
  return async (req, res, next) => {
    try {
      // Rate limiting check (skip in test environment)
      if (process.env.NODE_ENV !== 'test') {
        try {
          await rateLimiter.consume(req.ip);
        } catch (rateLimiterRes) {
          logAuthAttempt(req.ip, 'RATE_LIMIT_EXCEEDED');
          return res.status(429).json({ 
            error: 'Too many requests. Please try again later.' 
          });
        }
      }

      const token = req.header('Authorization')?.replace('Bearer ', '') || 
                   req.cookies?.accessToken;

      // Authentication
      if (!token) {
        if (roles === 'any') return next();
        logAuthAttempt(req.ip, 'MISSING_TOKEN');
        return res.status(401).json({ 
          error: 'Authentication required. No token provided.' 
        });
      }

      // Check if token is blacklisted
      const blacklisted = await isBlacklisted(token);
      if (blacklisted) {
        logAuthAttempt(req.ip, 'BLACKLISTED_TOKEN');
        return res.status(401).json({ 
          error: 'Token has been revoked. Please log in again.' 
        });
      }

      // Token verification
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: false });
      const user = await User.findById(decoded.userId)
        .select('-password -resetToken -resetTokenExpiry')
        .lean();

      if (!user) {
        logAuthAttempt(decoded.userId, 'USER_NOT_FOUND');
        return res.status(404).json({ 
          error: 'User account not found.' 
        });
      }

      // Check if user is active
      if (!user.isActive) {
        logAuthAttempt(user._id, 'ACCOUNT_INACTIVE');
        return res.status(403).json({ 
          error: 'Account is inactive. Please contact support.' 
        });
      }

      req.user = user;

      // Role authorization (if specified)
      if (roles !== 'any') {
        const requiredRoles = Array.isArray(roles) ? roles : [roles];
        if (!requiredRoles.some(role => user.roles.includes(role))) {
          logAuthAttempt(user._id, 'UNAUTHORIZED_ROLE', `Required: ${requiredRoles.join(', ')}`);
          return res.status(403).json({
            error: `Access denied. Required role(s): ${requiredRoles.join(', ')}`,
            requiredRoles
          });
        }
      }

      // Security headers for authenticated routes
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logAuthAttempt(req.ip, 'EXPIRED_TOKEN');
        return res.status(401).json({ 
          error: 'Session expired. Please log in again.' 
        });
      }
      
      logAuthAttempt(req.ip, 'AUTH_FAILURE', error.message);
      res.status(401).json({ 
        error: 'Invalid authentication token.' 
      });
    }
  };
};

/**
 * Resource ownership verification middleware with caching
 * @param {string} resourceType - Mongoose model name (property/lease/etc)
 * @param {string} idParam - Route parameter name containing the ID
 * @param {array} additionalConditions - Additional query conditions
 */
const authorizeOwnership = (resourceType, idParam = 'id', additionalConditions = []) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required for ownership verification.' 
      });
    }

    try {
      const conditions = [
        { _id: req.params[idParam] },
        { 
          $or: [
            { userId: req.user._id },
            { landlord: req.user._id },
            { owner: req.user._id }
          ]
        },
        ...additionalConditions
      ];

      const resource = await mongoose.model(resourceType)
        .findOne({ $and: conditions })
        .cache(30); // Cache for 30 seconds

      if (!resource) {
        logAuthAttempt(req.user._id, 'UNAUTHORIZED_ACCESS', resourceType);
        return res.status(403).json({
          error: `Access denied. You don't have ownership of this ${resourceType}.`,
          resourceType
        });
      }

      req[resourceType] = resource; // Dynamic property name
      next();
    } catch (error) {
      logAuthAttempt(req.user?._id, 'OWNERSHIP_VERIFICATION_FAILED', error.message);
      res.status(500).json({ 
        error: 'Resource ownership verification failed.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Tenant lease verification middleware with enhanced checks
 * @param {string} propertyIdParam - Route parameter name for property ID
 */
const verifyTenant = (propertyIdParam = 'propertyId') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required for tenant verification.' 
      });
    }

    try {
      const lease = await Lease.findOne({
        propertyId: req.params[propertyIdParam],
        tenantId: req.user._id,
        status: { $in: ['active', 'pending'] }
      })
      .populate('propertyId', 'name address')
      .cache(60); // Cache for 1 minute

      if (!lease) {
        logAuthAttempt(req.user._id, 'INVALID_TENANT_RELATIONSHIP');
        return res.status(403).json({
          error: 'Access denied. No valid lease found for this property.',
          propertyId: req.params[propertyIdParam]
        });
      }

      // Check lease validity dates if they exist
      if (lease.startDate && lease.endDate) {
        const now = new Date();
        if (now < lease.startDate || now > lease.endDate) {
          logAuthAttempt(req.user._id, 'LEASE_NOT_ACTIVE');
          return res.status(403).json({
            error: 'Your lease for this property is not currently active.',
            startDate: lease.startDate,
            endDate: lease.endDate
          });
        }
      }

      req.lease = lease;
      req.property = lease.propertyId; // Attach populated property
      next();
    } catch (error) {
      logAuthAttempt(req.user._id, 'TENANT_VERIFICATION_FAILED', error.message);
      res.status(500).json({ 
        error: 'Tenant verification service unavailable.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Middleware to verify email confirmation status
 */
const verifyEmailConfirmed = (req, res, next) => {
  if (!req.user?.isEmailVerified) {
    logAuthAttempt(req.user?._id, 'EMAIL_NOT_VERIFIED');
    return res.status(403).json({
      error: 'Please verify your email address to access this resource.'
    });
  }
  next();
};

module.exports = {
  authenticate,          // Primary authentication middleware
  authorizeOwnership,    // Resource ownership verification
  verifyTenant,         // Tenant relationship verification
  verifyEmailConfirmed, // Email verification check
  
  // Convenience middleware combinations
  authAdmin: authenticate(['admin', 'superadmin']),
  authLandlord: authenticate('landlord'),
  authTenant: [authenticate('tenant'), verifyTenant()],
  
  // Legacy exports (deprecated)
  authorizeRoles: (...roles) => authenticate(roles),
  isTenant: verifyTenant()
};