const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { param, body, validationResult } = require('express-validator');
const transactionController = require('../../controllers/transaction.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateMpesaPayment } = require('../../middlewares/validation');

const validateTransactionId = [
  param('transactionId').isMongoId().withMessage('Invalid transaction ID')
];

const validatePropertyId = [
  param('propertyId').isMongoId().withMessage('Invalid property ID')
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

router.post('/mpesa/stk-push', authenticate('tenant'), validateMpesaPayment, asyncHandler(transactionController.initiateMpesaPayment));
router.post('/mpesa/callback', asyncHandler(transactionController.handleMpesaCallback));
router.get('/history', authenticate, asyncHandler(transactionController.getTransactionHistory));
router.get('/reconcile', authenticate('admin'), asyncHandler(transactionController.reconcileTransactions));
router.get('/export/csv', authenticate('admin'), asyncHandler(transactionController.exportTransactionsCSV));
router.get('/property/:propertyId', authenticate('landlord'), validatePropertyId, validate, asyncHandler(transactionController.getPropertyTransactions));
router.get('/:transactionId', authenticate, validateTransactionId, validate, asyncHandler(transactionController.getTransactionDetails));
router.post('/:transactionId/resend-receipt', authenticate, validateTransactionId, validate, asyncHandler(transactionController.resendTransactionReceipt));
router.post('/:transactionId/retry', authenticate('tenant'), validateTransactionId, validate, asyncHandler(transactionController.retryFailedTransaction));

router.use((err, req, res, next) => {
  console.error('Transaction route error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.message });
  }
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return res.status(500).json({ error: 'Database error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
  res.status(500).json({ error: 'Transaction processing failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

module.exports = router;