const express = require('express');
const router = express.Router();
const transactionController = require('../../controllers/transaction.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateMpesaPayment } = require('../../middlewares/validation');

// M-Pesa Payment Processing
router.post('/mpesa/stk-push',
  authenticate('tenant'),
  validateMpesaPayment,
  transactionController.initiateMpesaPayment
);

// M-Pesa Callback (no auth - Safaricom servers call this)
router.post('/mpesa/callback',
  transactionController.handleMpesaCallback
);

// Transaction History
router.get('/history',
  authenticate,
  transactionController.getTransactionHistory
);

// Landlord Payment Records
router.get('/property/:propertyId',
  authenticate('landlord'),
  transactionController.getPropertyTransactions
);

// Admin Reconciliation
router.get('/reconcile',
  authenticate('admin'),
  transactionController.reconcileTransactions
);

// Transaction Details
router.get('/:transactionId',
  authenticate,
  transactionController.getTransactionDetails
);

// Resend Transaction Receipt
router.post('/:transactionId/resend-receipt',
  authenticate,
  transactionController.resendTransactionReceipt
);

// Failed Transaction Retry
router.post('/:transactionId/retry',
  authenticate('tenant'),
  transactionController.retryFailedTransaction
);

// Export transaction records (Admin only)
router.get('/export/csv',
  authenticate('admin'),
  transactionController.exportTransactionsCSV
);

module.exports = router;