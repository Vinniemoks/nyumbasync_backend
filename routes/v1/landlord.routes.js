const express = require('express');
const router = express.Router();
const landlordController = require('../../controllers/landlord.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// All landlord routes require authentication
router.use(authenticate());

// === AUTHENTICATION & ONBOARDING ===
router.post('/accounts', landlordController.createLandlordAccount);
router.post('/2fa/setup', landlordController.setup2FA);
router.post('/2fa/verify', landlordController.verify2FA);
router.post('/agreement', landlordController.acceptServiceAgreement);

// === PORTFOLIO SETUP ===
router.post('/properties', landlordController.registerProperty);
router.post('/properties/bulk-import', landlordController.bulkImportProperties);
router.post('/documents/verify', landlordController.uploadVerificationDocuments);

// === ROLE-BASED ACCESS CONTROL ===
router.post('/sub-accounts', landlordController.createSubAccount);
router.put('/sub-accounts/:userId/permissions', landlordController.updateSubAccountPermissions);

// === TENANT & LEASE MANAGEMENT (CRM) ===
router.get('/contacts', landlordController.getContacts);
router.post('/leases/from-template', landlordController.createLeaseFromTemplate);

// === FINANCIAL MANAGEMENT ===
router.get('/financial/dashboard', landlordController.getFinancialDashboard);

// === MAINTENANCE MANAGEMENT ===
router.get('/maintenance', landlordController.getMaintenanceRequests);
router.post('/maintenance/:requestId/assign-vendor', landlordController.assignVendor);

// === AUTOMATION & WORKFLOWS ===
router.post('/workflows', landlordController.createWorkflow);
router.get('/workflows', landlordController.getWorkflows);
router.post('/workflows/:workflowId/execute', landlordController.executeWorkflow);

// === VENDOR MANAGEMENT ===
router.post('/vendors', landlordController.createVendor);
router.get('/vendors', landlordController.getVendors);

// === ANALYTICS ===
router.get('/analytics/dashboard', landlordController.getDashboardAnalytics);

// === DOCUMENT MANAGEMENT ===
router.post('/documents', landlordController.uploadDocument);
router.get('/documents', landlordController.getDocuments);

module.exports = router;
