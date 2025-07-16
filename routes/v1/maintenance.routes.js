const router = require('express').Router();
const maintenanceController = require('../../controllers/maintenance.controller');
const { authenticate } = require('../../middleware');

// Tenant routes
router.post('/',
  authenticate('tenant'),
  maintenanceController.submitRequest
);

router.get('/my-requests',
  authenticate('tenant'),
  maintenanceController.getMyRequests
);

// Vendor routes
router.patch('/:id/status',
  authenticate('vendor'),
  maintenanceController.updateStatus
);

// Landlord routes
router.get('/property/:id',
  authenticate('landlord'),
  maintenanceController.getPropertyRequests
);

module.exports = router;
