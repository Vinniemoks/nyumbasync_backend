const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// M-Pesa callbacks (no auth — called by Safaricom) - Place these FIRST
router.post('/mpesa-callback',
  paymentController.mpesaCallback
);
// C2B Paybill validation + confirmation (STK-failure fallback).
router.post('/mpesa/c2b/validation',
  paymentController.c2bValidation
);
router.post('/mpesa/c2b/confirmation',
  paymentController.c2bConfirmation
);
// Card gateway webhook (no auth — signature-verified). Raw body so the HMAC
// signature can be checked byte-for-byte.
router.post('/card/webhook',
  express.raw({ type: '*/*' }),
  paymentController.cardWebhook
);

// Tenant payment routes — STK push initiation. Both paths hit the same handler
// (/mpesa is the legacy alias; /mpesa/stk-push is what the web client calls).
router.post('/mpesa/stk-push',
  authenticate('tenant'),
  paymentController.initiateStkPush
);
router.post('/mpesa',
  authenticate('tenant'),
  paymentController.initiateStkPush
);

// Paybill fallback when STK push fails — issue an expiring account number.
router.post('/mpesa/paybill',
  authenticate('tenant'),
  paymentController.requestPaybillFallback
);

// Bank transfer (manual landlord confirmation).
router.post('/bank/initiate',
  authenticate('tenant'),
  paymentController.initiateBankPayment
);
router.post('/bank/submit-reference',
  authenticate('tenant'),
  paymentController.submitBankReference
);

// Card payment via gateway-hosted 3-D Secure.
router.post('/card/initiate',
  authenticate('tenant'),
  paymentController.initiateCardPayment
);

// Landlord: bank payments awaiting verification + approve/reject.
router.get('/pending-verification',
  authenticate('landlord'),
  paymentController.listPendingVerification
);
router.post('/:id/verify',
  authenticate('landlord'),
  paymentController.verifyPayment
);

// Poll a payment's status after STK push / Paybill fallback.
router.get('/status/:id',
  authenticate('tenant'),
  paymentController.checkPaymentStatus
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