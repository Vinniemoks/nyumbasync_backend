const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// M-Pesa callback (no auth required) - Place this FIRST
router.post('/mpesa-callback',
  paymentController.mpesaCallback
);

// Tenant payment routes
router.post('/mpesa',
  authenticate('tenant'),
  paymentController.payRent
);

router.get('/history',
  authenticate('tenant'),
  paymentController.paymentHistory
);

// Admin reconciliation
router.get('/reconcile',
  authenticate('admin'),
  paymentController.reconcilePayments
);

module.exports = router;