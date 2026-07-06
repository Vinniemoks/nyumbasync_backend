const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const paymentController = require('../../controllers/payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Rate limiters — protect payment endpoints from abuse and replay floods.
const initiateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please wait a minute.' }
});

const callbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many callbacks.' }
});

// M-Pesa callbacks (no auth — called by Safaricom) - Place these FIRST
router.post('/mpesa-callback',
  callbackLimiter,
  paymentController.mpesaCallback
);
// C2B Paybill validation + confirmation (STK-failure fallback).
router.post('/mpesa/c2b/validation',
  callbackLimiter,
  paymentController.c2bValidation
);
router.post('/mpesa/c2b/confirmation',
  callbackLimiter,
  paymentController.c2bConfirmation
);
// Card gateway webhook (no auth — signature-verified). Raw body so the HMAC
// signature can be checked byte-for-byte.
router.post('/card/webhook',
  callbackLimiter,
  express.raw({ type: '*/*' }),
  paymentController.cardWebhook
);

// Tenant payment routes — STK push initiation. Both paths hit the same handler
// (/mpesa is the legacy alias; /mpesa/stk-push is what the web client calls).
router.post('/mpesa/stk-push',
  initiateLimiter,
  authenticate('tenant'),
  paymentController.initiateStkPush
);
router.post('/mpesa',
  initiateLimiter,
  authenticate('tenant'),
  paymentController.initiateStkPush
);

// Landlord/manager/agent prompts the tenant's phone for an invoice payment
// (full outstanding balance by default, or a partial amount).
router.post('/mpesa/prompt',
  initiateLimiter,
  authenticate(['landlord', 'manager', 'agent', 'admin', 'super_admin']),
  paymentController.promptTenantStkPush
);

// Paybill fallback when STK push fails — issue an expiring account number.
router.post('/mpesa/paybill',
  initiateLimiter,
  authenticate('tenant'),
  paymentController.requestPaybillFallback
);

// Bank transfer (manual landlord confirmation).
router.post('/bank/initiate',
  initiateLimiter,
  authenticate('tenant'),
  paymentController.initiateBankPayment
);
router.post('/bank/submit-reference',
  initiateLimiter,
  authenticate('tenant'),
  paymentController.submitBankReference
);

// Card payment via gateway-hosted 3-D Secure.
router.post('/card/initiate',
  initiateLimiter,
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

// Poll a payment's status after STK push / Paybill fallback. Tenants poll
// their own payments; landlords/managers/agents poll prompts they initiated.
router.get('/status/:id',
  authenticate(['tenant', 'landlord', 'manager', 'agent', 'admin']),
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