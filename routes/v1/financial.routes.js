const express = require('express');
const router = express.Router();
const financialController = require('../../controllers/financial.controller');
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth.middleware');
const { validateFinancialRequest } = require('../../middlewares/validation');

// Protect all routes with authentication
router.use(authMiddleware);

// Generate financial reports
router.get('/reports',
  roleMiddleware(['admin', 'propertyManager', 'landlord']),
  financialController.generateFinancialReport
);

// Handle payment disputes
router.post('/disputes',
  validateFinancialRequest,
  financialController.handlePaymentDispute
);

// Schedule recurring payments
router.post('/recurring',
  roleMiddleware(['tenant']),
  validateFinancialRequest,
  financialController.scheduleRecurringPayment
);

// Generate payment reminders
router.post('/reminders/:propertyId',
  roleMiddleware(['admin', 'propertyManager', 'landlord']),
  financialController.generatePaymentReminders
);

module.exports = router;