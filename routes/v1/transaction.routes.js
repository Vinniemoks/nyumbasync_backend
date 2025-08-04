const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler'); // Add this
const transactionController = require('../../controllers/transaction.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateMpesaPayment } = require('../../middlewares/validation');

// Modified dynamic routes to use simpler parameter names
router.post('/mpesa/stk-push',
  authenticate('tenant'),
  validateMpesaPayment,
  asyncHandler(transactionController.initiateMpesaPayment) // Wrapped in asyncHandler
);

router.post('/mpesa/callback',
  asyncHandler(transactionController.handleMpesaCallback)
);

// Changed parameter format
router.get('/history',
  authenticate,
  asyncHandler(transactionController.getTransactionHistory)
);

// Simplified parameter name from :propertyId to :id
router.get('/property/:id',
  authenticate('landlord'),
  asyncHandler(transactionController.getPropertyTransactions)
);

router.get('/reconcile',
  authenticate('admin'),
  asyncHandler(transactionController.reconcileTransactions)
);

// Simplified parameter name from :transactionId to :id
router.get('/:id',
  authenticate,
  asyncHandler(transactionController.getTransactionDetails)
);

router.post('/:id/resend-receipt',
  authenticate,
  asyncHandler(transactionController.resendTransactionReceipt)
);

router.post('/:id/retry',
  authenticate('tenant'),
  asyncHandler(transactionController.retryFailedTransaction)
);

router.get('/export/csv',
  authenticate('admin'),
  asyncHandler(transactionController.exportTransactionsCSV)
);

// Add error handling middleware
router.use((err, req, res, next) => {
  console.error('Transaction route error:', err);
  res.status(500).json({ error: 'Transaction processing failed' });
});

module.exports = router;