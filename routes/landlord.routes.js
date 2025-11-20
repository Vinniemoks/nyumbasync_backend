const express = require('express');
const router = express.Router();
const landlordController = require('../controllers/landlord.controller');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth.middleware');

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * PHASE 1: Authentication & Onboarding
 */

// Create landlord account (Super Admin only)
router.post('/accounts', 
  roleMiddleware(['admin']), 
  landlordController.createLandlordAccount
);

// 2FA Setup
router.post('/2fa/setup', 
  roleMiddleware(['landlord']), 
  landlordController.setup2FA
);

router.post('/2fa/verify', 
  roleMiddleware(['landlord']), 
  landlordController.verify2FA
);

// Service Agreement
router.post('/service-agreement/accept', 
  roleMiddleware(['landlord']), 
  landlordController.acceptServiceAgreement
);

/**
 * PHASE 2: Portfolio Setup & Property Management
 */

// Property Registration
router.post('/properties', 
  roleMiddleware(['landlord']), 
  landlordController.registerProperty
);

router.post('/properties/bulk-import', 
  roleMiddleware(['landlord']), 
  landlordController.bulkImportProperties
);

// Verification Documents
router.post('/verification/documents', 
  roleMiddleware(['landlord']), 
  landlordController.uploadVerificationDocuments
);

/**
 * PHASE 3: Role-Based Access Control
 */

// Sub-Account Management
router.post('/sub-accounts', 
  roleMiddleware(['landlord']), 
  landlordController.createSubAccount
);

router.put('/sub-accounts/:userId/permissions', 
  roleMiddleware(['landlord']), 
  landlordController.updateSubAccountPermissions
);

/**
 * PHASE 4: Tenant & Lease Management (CRM)
 */

// Contacts/CRM
router.get('/contacts', 
  roleMiddleware(['landlord']), 
  landlordController.getContacts
);

// Lease Management
router.post('/leases', 
  roleMiddleware(['landlord']), 
  landlordController.createLeaseFromTemplate
);

/**
 * PHASE 5: Financial Management
 */

// Financial Dashboard
router.get('/financial/dashboard', 
  roleMiddleware(['landlord']), 
  landlordController.getFinancialDashboard
);

/**
 * PHASE 6: Maintenance Management
 */

// Maintenance Requests
router.get('/maintenance/requests', 
  roleMiddleware(['landlord']), 
  landlordController.getMaintenanceRequests
);

router.put('/maintenance/requests/:requestId/assign-vendor', 
  roleMiddleware(['landlord']), 
  landlordController.assignVendor
);

/**
 * PHASE 7: Automation & Workflows
 */

// Workflows
router.post('/workflows', 
  roleMiddleware(['landlord']), 
  landlordController.createWorkflow
);

router.get('/workflows', 
  roleMiddleware(['landlord']), 
  landlordController.getWorkflows
);

router.post('/workflows/:workflowId/execute', 
  roleMiddleware(['landlord']), 
  landlordController.executeWorkflow
);

/**
 * PHASE 8: Vendor Management
 */

// Vendors
router.post('/vendors', 
  roleMiddleware(['landlord']), 
  landlordController.createVendor
);

router.get('/vendors', 
  roleMiddleware(['landlord']), 
  landlordController.getVendors
);

/**
 * PHASE 9: Reporting & Analytics
 */

// Dashboard Analytics
router.get('/analytics/dashboard', 
  roleMiddleware(['landlord']), 
  landlordController.getDashboardAnalytics
);

/**
 * PHASE 10: Document Management
 */

// Documents
router.post('/documents', 
  roleMiddleware(['landlord']), 
  landlordController.uploadDocument
);

router.get('/documents', 
  roleMiddleware(['landlord']), 
  landlordController.getDocuments
);

module.exports = router;
