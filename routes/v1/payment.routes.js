const router = require('express').Router();
const paymentController = require('../../controllers/payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware'); // Corrected import path

// Tenant payment routes
router.use(authenticate('tenant'));

router.post('/mpesa',
  paymentController.payRent
);

router.get('/history',
  paymentController.paymentHistory
);

// M-Pesa callback (no auth)
router.post('/mpesa-callback',
  paymentController.mpesaCallback
);

// Admin reconciliation
router.use(authenticate('admin'));

router.get('/reconcile',
  paymentController.reconcilePayments
);

module.exports = router;
