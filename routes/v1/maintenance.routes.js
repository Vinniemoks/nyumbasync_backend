const router = require('express').Router();
const maintenanceController = require('../../controllers/maintenance.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Role-aware list of maintenance requests (tenant: own; landlord: their
// properties'; admin/manager: all). Used by the desktop & mobile dashboards;
// previously there was no GET '/' so those calls 404'd.
router.get('/',
  authenticate(),
  maintenanceController.getMaintenanceRequests
);

// Landlord/manager/admin update of a request (status, priority, vendor).
router.put('/:id',
  authenticate(['landlord', 'manager', 'admin']),
  maintenanceController.manageMaintenanceRequest
);

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
