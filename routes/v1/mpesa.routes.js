const express = require('express');
const router = express.Router();
const mpesaController = require('../../controllers/mpesa.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

/**
 * @swagger ⚠️ mpesa routes not found at C:\Users\USER\NyumbaSync\nyumbasync_backend\routes\v1\mpesa.routes.js. Error: Invalid validator. Received (undefined) undefined. See https://mongoosejs.com/docs/api/schematype.html#schematype_SchemaType-validate
 * tags:
 *   name: M-Pesa
 *   description: M-Pesa payment processing
 */

// STK-push rent collection and its callback have moved to the canonical,
// invoice-aware flow: POST /payments/mpesa/stk-push and POST
// /payments/mpesa-callback (see payment.routes.js). The routes below are the
// M-Pesa surfaces unique to this controller.

/**
 * @swagger
 * /v1/mpesa/query:
 *   post:
 *     summary: Query transaction status
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 */
router.post('/query', authenticate(), mpesaController.queryTransactionStatus);

/**
 * @swagger
 * /v1/mpesa/b2c:
 *   post:
 *     summary: Initiate B2C payment (landlord payout)
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 */
// B2C payouts move money OUT — restrict to admins (assessment C11).
router.post('/b2c', authenticate(['admin', 'super_admin']), mpesaController.initiateB2CPayment);

module.exports = router;