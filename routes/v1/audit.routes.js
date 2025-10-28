const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation');
const { query } = require('express-validator');

// Validation middleware
const validateDateRange = [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validate
];

// Get audit logs with filtering and pagination
router.get(
  '/logs',
  authenticate(['admin', 'superadmin']),
  [
    ...validateDateRange,
    query('userId').optional().isMongoId(),
    query('action').optional().isString(),
    query('category').optional().isString(),
    query('status').optional().isIn(['success', 'failure', 'warning']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['timestamp', 'action', 'category', 'status']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    validate
  ],
  auditController.getAuditLogs
);

// Get audit statistics
router.get(
  '/stats',
  authenticate(['admin', 'superadmin']),
  validateDateRange,
  auditController.getAuditStats
);

// Export audit logs
router.get(
  '/export',
  authenticate(['admin', 'superadmin']),
  [
    ...validateDateRange,
    query('format').optional().isIn(['csv', 'json']),
    validate
  ],
  auditController.exportAuditLogs
);

module.exports = router;