const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analytics.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validation');
const { query } = require('express-validator');

// Validation middleware for period
const validatePeriod = [
  query('period')
    .optional()
    .isIn(['today', 'week', 'month', 'year'])
    .withMessage('Invalid period'),
  validate
];

// Dashboard Overview
router.get(
  '/dashboard',
  authenticate(['admin', 'superadmin']),
  validatePeriod,
  analyticsController.getDashboardStats
);

// Property Analytics
router.get(
  '/properties',
  authenticate(['admin', 'superadmin']),
  validatePeriod,
  analyticsController.getPropertyAnalytics
);

// Financial Analytics
router.get(
  '/financial',
  authenticate(['admin', 'superadmin']),
  [
    ...validatePeriod,
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('Invalid grouping'),
    validate
  ],
  analyticsController.getFinancialAnalytics
);

// User Analytics
router.get(
  '/users',
  authenticate(['admin', 'superadmin']),
  validatePeriod,
  analyticsController.getUserAnalytics
);

module.exports = router;