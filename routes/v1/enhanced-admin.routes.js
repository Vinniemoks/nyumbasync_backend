const express = require('express');
const router = express.Router();
const enhancedAdminController = require('../controllers/enhanced-admin.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation');
const { body, param } = require('express-validator');
const rateLimiter = require('express-rate-limit');

// Rate limiting for admin routes
const adminLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Apply rate limiter to all routes
router.use(adminLimiter);

// Admin User Management Routes
router.post(
  '/users',
  authenticate(['superadmin']),
  [
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('roleId').isMongoId(),
    body('allowedIPs').optional().isArray(),
    validate
  ],
  enhancedAdminController.createAdmin
);

// 2FA Routes
router.post(
  '/2fa/enable',
  authenticate(['admin', 'superadmin']),
  enhancedAdminController.enable2FA
);

router.post(
  '/2fa/verify',
  authenticate(['admin', 'superadmin']),
  [
    body('token').isString().isLength({ min: 6, max: 6 }),
    validate
  ],
  enhancedAdminController.verify2FA
);

router.post(
  '/login',
  [
    body('email').isEmail(),
    body('password').exists(),
    body('token').optional().isString(),
    validate
  ],
  enhancedAdminController.loginWith2FA
);

// Admin Status Management
router.patch(
  '/users/:adminId/status',
  authenticate(['superadmin']),
  [
    param('adminId').isMongoId(),
    body('status').isIn(['active', 'inactive', 'suspended']),
    validate
  ],
  enhancedAdminController.updateAdminStatus
);

// Audit Logs
router.get(
  '/audit-logs/:adminId',
  authenticate(['admin', 'superadmin']),
  [
    param('adminId').isMongoId(),
    validate
  ],
  enhancedAdminController.getAuditLogs
);

// Role Management
router.post(
  '/roles',
  authenticate(['superadmin']),
  [
    body('name').isString().notEmpty(),
    body('permissions').isArray(),
    body('description').isString().notEmpty(),
    validate
  ],
  enhancedAdminController.createRole
);

router.get(
  '/roles',
  authenticate(['admin', 'superadmin']),
  enhancedAdminController.getRoles
);

router.patch(
  '/roles/:roleId',
  authenticate(['superadmin']),
  [
    param('roleId').isMongoId(),
    body('permissions').isArray(),
    validate
  ],
  enhancedAdminController.updateRolePermissions
);

module.exports = router;