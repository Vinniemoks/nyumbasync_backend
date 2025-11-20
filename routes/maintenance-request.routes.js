/**
 * Maintenance Request Routes
 */

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance-request.controller');
const { optionalTenantAuth } = require('../middlewares/tenant-portal-auth.middleware');

// Apply optional tenant auth to allow both landlord and tenant access
router.use(optionalTenantAuth);

// Special routes (must come before :id routes)
router.get('/by-tenant/:tenantId', maintenanceController.getByTenant);
router.get('/by-property/:propertyId', maintenanceController.getByProperty);
router.get('/open', maintenanceController.getOpenRequests);
router.get('/overdue', maintenanceController.getOverdueRequests);
router.get('/emergency', maintenanceController.getEmergencyRequests);
router.get('/stats/property/:propertyId', maintenanceController.getStatsByProperty);

// CRUD routes
router.get('/', maintenanceController.getAllRequests);
router.get('/:id', maintenanceController.getRequestById);
router.post('/', maintenanceController.createRequest);
router.put('/:id', maintenanceController.updateRequest);

// Request actions
router.post('/:id/acknowledge', maintenanceController.acknowledgeRequest);
router.post('/:id/schedule', maintenanceController.scheduleRequest);
router.post('/:id/assign', maintenanceController.assignVendor);
router.post('/:id/start', maintenanceController.startWork);
router.post('/:id/complete', maintenanceController.completeWork);
router.post('/:id/close', maintenanceController.closeRequest);
router.post('/:id/cancel', maintenanceController.cancelRequest);
router.post('/:id/updates', maintenanceController.addUpdate);
router.post('/:id/feedback', maintenanceController.submitFeedback);

module.exports = router;
