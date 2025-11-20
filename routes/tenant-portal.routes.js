/**
 * Tenant Portal Routes
 */

const express = require('express');
const router = express.Router();
const tenantPortalController = require('../controllers/tenant-portal.controller');
const { 
  authenticateTenant, 
  requireEmailVerification,
  requireLinkedLease,
  requireCompletedProfile 
} = require('../middlewares/tenant-portal-auth.middleware');

// Public routes - No authentication required
router.post('/register', tenantPortalController.registerTenant);
router.get('/verify-email/:token', tenantPortalController.verifyEmail);
router.post('/login', tenantPortalController.requestLogin);
router.post('/authenticate/:token', tenantPortalController.authenticateWithMagicLink);

// Protected routes - Require authentication
router.use(authenticateTenant); // All routes below require authentication

// Phase 2: Lease Linking
router.post('/link-lease', requireEmailVerification, tenantPortalController.linkLease);

// Phase 3: Profile Management
router.post('/complete-profile', 
  requireEmailVerification, 
  requireLinkedLease, 
  tenantPortalController.completeProfile
);

router.get('/profile', tenantPortalController.getProfile);
router.put('/profile', tenantPortalController.updateProfile);

// Session management
router.post('/logout', tenantPortalController.logout);

// Landlord actions (these should be protected by landlord auth in production)
router.post('/generate-code/:transactionId', tenantPortalController.generateLeaseCode);
router.post('/send-invitation/:transactionId', tenantPortalController.sendTenantInvitation);

module.exports = router;
