const express = require('express');
const router = express.Router();
const mpesaController = require('../controllers/mpesa.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// M-Pesa endpoints
router.post('/stkpush', authMiddleware, mpesaController.initiateSTKPush);
router.post('/callback', mpesaController.handleCallback); // Safaricom's callback URL
router.post('/query', authMiddleware, mpesaController.queryTransactionStatus);

// B2C (e.g., landlord payouts)
router.post('/b2c', authMiddleware, mpesaController.initiateB2CPayment);

module.exports = router;