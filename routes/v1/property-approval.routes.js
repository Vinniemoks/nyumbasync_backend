const express = require('express');
const router = express.Router();
const propertyApprovalController = require('../../controllers/property-approval.controller');
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth.middleware');
const { validatePropertyApproval } = require('../../middlewares/validation');

// Protect all routes with authentication
router.use(authMiddleware);

// Submit property for approval
router.post('/submit',
  roleMiddleware(['landlord', 'agent']),
  validatePropertyApproval,
  propertyApprovalController.submitForApproval
);

// Review and update property approval
router.put('/:approvalId/review',
  roleMiddleware(['admin', 'propertyManager']),
  propertyApprovalController.reviewApproval
);

// Schedule property inspection
router.post('/:approvalId/inspections',
  roleMiddleware(['admin', 'propertyManager', 'inspector']),
  propertyApprovalController.scheduleInspection
);

// Complete inspection
router.put('/:approvalId/inspections/:inspectionId',
  roleMiddleware(['admin', 'propertyManager', 'inspector']),
  propertyApprovalController.completeInspection
);

// Get property approval status
router.get('/property/:propertyId',
  propertyApprovalController.getApprovalStatus
);

// List properties pending approval (admin only)
router.get('/pending',
  roleMiddleware(['admin', 'propertyManager']),
  propertyApprovalController.listPendingApprovals
);

module.exports = router;