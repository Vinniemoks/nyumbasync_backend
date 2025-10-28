const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation');
const { body, param, query } = require('express-validator');

// Validation middleware
const validateConfig = [
  body('key').isString().trim().notEmpty(),
  body('value').exists(),
  body('type').isIn(['string', 'number', 'boolean', 'json', 'array']),
  body('category').isIn([
    'system',
    'email',
    'payment',
    'security',
    'notification',
    'feature_flags',
    'maintenance',
    'other'
  ]),
  body('description').isString().trim().notEmpty(),
  body('isPublic').isBoolean(),
  validate
];

// Create or update configuration (admin only)
router.put(
  '/',
  authenticate(['admin', 'superadmin']),
  validateConfig,
  configController.upsertConfig
);

// Get all configurations
router.get(
  '/',
  authenticate(),
  [
    query('category').optional().isString(),
    validate
  ],
  configController.getConfigs
);

// Get single configuration
router.get(
  '/:key',
  authenticate(),
  [
    param('key').isString().trim().notEmpty(),
    validate
  ],
  configController.getConfig
);

// Delete configuration (superadmin only)
router.delete(
  '/:key',
  authenticate(['superadmin']),
  [
    param('key').isString().trim().notEmpty(),
    validate
  ],
  configController.deleteConfig
);

// Get configuration history (admin only)
router.get(
  '/:key/history',
  authenticate(['admin', 'superadmin']),
  [
    param('key').isString().trim().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate
  ],
  configController.getConfigHistory
);

// Restore configuration to previous version (superadmin only)
router.post(
  '/:key/restore',
  authenticate(['superadmin']),
  [
    param('key').isString().trim().notEmpty(),
    body('version').isInt({ min: 1 }),
    validate
  ],
  configController.restoreConfig
);

module.exports = router;