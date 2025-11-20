/**
 * Tenant Journey Routes
 */

const express = require('express');
const router = express.Router();
const tenantJourneyController = require('../controllers/tenant-journey.controller');

// Dashboard and stats
router.get('/dashboard', tenantJourneyController.getDashboard);
router.get('/late-payments', tenantJourneyController.getLatePayments);
router.get('/pending-applications', tenantJourneyController.getPendingApplications);

// Stage-based queries
router.get('/stage/:stage', tenantJourneyController.getByStage);

// Contact journey actions
router.put('/:contactId/stage', tenantJourneyController.moveToStage);
router.post('/:contactId/submit-application', tenantJourneyController.submitApplication);
router.post('/:contactId/approve', tenantJourneyController.approveApplication);
router.post('/:contactId/reject', tenantJourneyController.rejectApplication);
router.post('/:contactId/activate-lease', tenantJourneyController.activateLease);
router.post('/:contactId/rent-payment', tenantJourneyController.recordRentPayment);
router.post('/:contactId/move-out-notice', tenantJourneyController.submitMoveOutNotice);
router.post('/:contactId/close-tenancy', tenantJourneyController.closeTenancy);

module.exports = router;
