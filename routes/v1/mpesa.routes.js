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

/**
 * @swagger
 * /v1/mpesa/stkpush:
 *   post:
 *     summary: Initiate STK Push payment
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 */
router.post('/stkpush', authenticate, mpesaController.initiateSTKPush);

/**
 * @swagger
 * /v1/mpesa/callback:
 *   post:
 *     summary: M-Pesa payment callback
 *     tags: [M-Pesa]
 */
router.post('/callback', mpesaController.handleCallback);

/**
 * @swagger
 * /v1/mpesa/query:
 *   post:
 *     summary: Query transaction status
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 */
router.post('/query', authenticate, mpesaController.queryTransactionStatus);

/**
 * @swagger
 * /v1/mpesa/b2c:
 *   post:
 *     summary: Initiate B2C payment (landlord payout)
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 */
router.post('/b2c', authenticate, mpesaController.initiateB2CPayment);

module.exports = router;