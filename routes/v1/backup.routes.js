const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// All backup routes require superadmin access
router.use(authenticate(['superadmin']));

// Create backup
router.post(
  '/create',
  backupController.createBackup
);

// List backups
router.get(
  '/list',
  backupController.listBackups
);

// Restore from backup
router.post(
  '/restore/:backupId',
  backupController.restoreBackup
);

// Delete backup
router.delete(
  '/:backupId',
  backupController.deleteBackup
);

module.exports = router;