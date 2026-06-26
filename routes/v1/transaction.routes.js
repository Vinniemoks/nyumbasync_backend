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

module.exports = [
  {
    method: 'POST',
    path: '/mpesa/stk-push',
    handler: [
      authenticate('tenant'),
      validateMpesaPayment,
      asyncHandler(transactionController.initiateMpesaPayment)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'POST',
    path: '/mpesa/callback',
    handler: asyncHandler(transactionController.handleMpesaCallback),
    config: { source: 'transaction.routes' }
  },
  {
    method: 'GET',
    path: '/history',
    handler: [
      authenticate,
      asyncHandler(transactionController.getTransactionHistory)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'GET',
    path: '/reconcile',
    handler: [
      authenticate('admin'),
      asyncHandler(transactionController.reconcileTransactions)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'GET',
    path: '/export/csv',
    handler: [
      authenticate('admin'),
      asyncHandler(transactionController.exportTransactionsCSV)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'GET',
    path: '/property/:propertyId',
    handler: [
      authenticate('landlord'),
      validatePropertyId,
      validate,
      asyncHandler(transactionController.getPropertyTransactions)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'GET',
    path: '/:transactionId',
    handler: [
      authenticate,
      validateTransactionId,
      validate,
      asyncHandler(transactionController.getTransactionDetails)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'POST',
    path: '/:transactionId/resend-receipt',
    handler: [
      authenticate,
      validateTransactionId,
      validate,
      asyncHandler(transactionController.resendTransactionReceipt)
    ],
    config: { source: 'transaction.routes' }
  },
  {
    method: 'POST',
    path: '/:transactionId/retry',
    handler: [
      authenticate('tenant'),
      validateTransactionId,
      validate,
      asyncHandler(transactionController.retryFailedTransaction)
    ],
    config: { source: 'transaction.routes' }
  }
];
