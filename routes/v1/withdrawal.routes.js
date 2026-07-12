const express = require('express');
const router = express.Router();
const withdrawalController = require('../../controllers/withdrawal.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Only money-collecting roles can see balances or move funds out.
const PAYEE_ROLES = ['landlord', 'manager', 'agent', 'admin'];

router.get('/balance',
  authenticate(PAYEE_ROLES),
  withdrawalController.getBalance
);

// Email a one-time withdrawal code (fallback for accounts without TOTP).
router.post('/otp',
  authenticate(PAYEE_ROLES),
  withdrawalController.requestOtp
);

// Create an MFA-verified withdrawal request (M-Pesa or bank).
router.post('/',
  authenticate(PAYEE_ROLES),
  withdrawalController.createWithdrawal
);

router.get('/',
  authenticate(PAYEE_ROLES),
  withdrawalController.listWithdrawals
);

// Vendor earnings withdrawal
router.get('/vendor/balance',
  authenticate('vendor'),
  withdrawalController.getVendorBalance
);

router.post('/vendor',
  authenticate('vendor'),
  withdrawalController.createVendorWithdrawal
);

module.exports = router;
