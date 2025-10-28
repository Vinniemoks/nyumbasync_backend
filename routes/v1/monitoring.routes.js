const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoring.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation');
const { query } = require('express-validator');

// Basic health check (public)
router.get('/health', monitoringController.getHealthStatus);

// System metrics (admin only)
router.get(
  '/metrics',
  authenticate(['admin', 'superadmin']),
  monitoringController.getSystemMetrics
);

// System alerts
router.get(
  '/alerts',
  authenticate(['admin', 'superadmin']),
  [
    query('type').optional().isString(),
    query('level').optional().isIn(['warning', 'critical']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate
  ],
  monitoringController.getAlerts
);

// Detailed system status
router.get(
  '/status',
  authenticate(['admin', 'superadmin']),
  monitoringController.getDetailedStatus
);

module.exports = router;