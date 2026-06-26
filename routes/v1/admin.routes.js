const asyncHandler = require('express-async-handler');
const adminController = require('../../controllers/admin.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array() 
    });
  }
  next();
};

// Lease ID validation
const validateLeaseId = [
  param('leaseId')
    .isMongoId()
    .withMessage('Invalid lease ID format'),
  validate
];

// User management validation
const validateUserManagement = [
  body('action')
    .isIn(['activate', 'deactivate', 'promote', 'demote'])
    .withMessage('Invalid management action'),
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  validate
];

module.exports = [
  // Dashboard routes
  {
    method: 'GET',
    path: '/dashboard',
    handler: [
      authenticate('admin'),
      asyncHandler(adminController.getDashboardStats)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Get admin dashboard statistics'
    }
  },

  // Lease management routes
  {
    method: 'GET',
    path: '/leases',
    handler: [
      authenticate('admin'),
      asyncHandler(adminController.getLeases)
    ],
    config: { 
      source: 'admin.routes',
      description: 'List all leases'
    }
  },
  {
    method: 'POST',
    path: '/leases',
    handler: [
      authenticate('admin'),
      [
        body('propertyId').isMongoId(),
        body('tenantId').isMongoId(),
        body('startDate').isISO8601(),
        body('endDate').isISO8601(),
        body('rentAmount').isNumeric(),
        validate
      ],
      asyncHandler(adminController.createLease)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Create new lease'
    }
  },
  {
    method: 'PUT',
    path: '/leases/:leaseId',
    handler: [
      authenticate('admin'),
      validateLeaseId,
      [
        body('endDate').optional().isISO8601(),
        body('rentAmount').optional().isNumeric(),
        body('status').optional().isIn(['active', 'terminated', 'expired']),
        validate
      ],
      asyncHandler(adminController.updateLease)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Update lease details'
    }
  },
  {
    method: 'DELETE',
    path: '/leases/:leaseId',
    handler: [
      authenticate('admin'),
      validateLeaseId,
      asyncHandler(adminController.terminateLease)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Terminate lease'
    }
  },
  {
    method: 'POST',
    path: '/leases/:leaseId/renew',
    handler: [
      authenticate('admin'),
      validateLeaseId,
      [
        body('extensionMonths').isInt({ min: 1, max: 24 }),
        validate
      ],
      asyncHandler(adminController.renewLease)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Renew existing lease'
    }
  },

  // User management routes
  {
    method: 'POST',
    path: '/users/manage',
    handler: [
      authenticate('admin'),
      validateUserManagement,
      asyncHandler(adminController.manageUsers)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Manage user accounts'
    }
  },

  // Compliance and legal routes
  {
    method: 'GET',
    path: '/compliance',
    handler: [
      authenticate('admin'),
      asyncHandler(adminController.checkCompliance)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Check system compliance status'
    }
  },
  {
    method: 'POST',
    path: '/notices',
    handler: [
      authenticate('admin'),
      [
        body('title').isString().trim().notEmpty(),
        body('message').isString().trim().notEmpty(),
        body('recipients').isArray({ min: 1 }),
        validate
      ],
      asyncHandler(adminController.sendLegalNotices)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Send legal notices to users'
    }
  },

  // Reporting routes
  {
    method: 'GET',
    path: '/reports/rent',
    handler: [
      authenticate('admin'),
      [
        param('year').optional().isInt({ min: 2020, max: 2030 }),
        param('month').optional().isInt({ min: 1, max: 12 }),
        validate
      ],
      asyncHandler(adminController.generateFinancialReport)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Generate rent collection report'
    }
  },

  // System maintenance routes
  {
    method: 'POST',
    path: '/maintenance',
    handler: [
      authenticate('admin'),
      [
        body('action').isIn(['backup', 'restore', 'cleanup']),
        body('confirm').isBoolean().equals(true),
        validate
      ],
      asyncHandler(adminController.systemMaintenance)
    ],
    config: { 
      source: 'admin.routes',
      description: 'Perform system maintenance tasks'
    }
  }
];