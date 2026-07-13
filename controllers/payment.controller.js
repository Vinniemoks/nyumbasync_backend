const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const Invoice = require('../models/invoice.model');
const Property = require('../models/property.model');
const Lease = require('../models/lease.model');
const User = require('../models/user.model');
const LandlordProfile = require('../models/landlord-profile.model');
const VendorWallet = require('../models/vendor-wallet.model');
const invoiceService = require('../services/invoice.service');
const mpesaService = require('../services/mpesa.service');
const cardGateway = require('../services/gateways');
const emailService = require('../services/emailService');
const smsService = require('../services/sms.service');
const configService = require('../services/config.service');
const { generateUniqueAccountRef } = require('../utils/payment-ref');
const { sendToUser } = require('../websocket/server');
const logger = require('../utils/logger');

// How long a Paybill fallback account number stays valid before it expires and
// any payment to it is auto-reversed.
const C2B_TTL_MS = (parseInt(process.env.MPESA_C2B_TTL_MINUTES, 10) || 10) * 60 * 1000;
// Bank transfers get a longer window (the tenant has to make the transfer).
const BANK_TTL_MS = (parseInt(process.env.BANK_TTL_HOURS, 10) || 48) * 60 * 60 * 1000;
// Minimum amount the platform will accept for a rent/M-Pesa payment. M-Pesa
// itself may reject very small amounts, but allowing KES 1 makes testing and
// micro-payments possible.
const MIN_PAYMENT_AMOUNT = 1;

// ---- helpers --------------------------------------------------------------

// Normalize a Kenyan number to Safaricom's 2547XXXXXXXX / 2541XXXXXXXX form.
const normalizePhone = (raw = '') => {
  let p = String(raw).replace(/\D/g, '');
  if (p.startsWith('0')) p = `254${p.slice(1)}`;
  else if (p.startsWith('254')) { /* already normalized */ }
  else if (p.length === 9) p = `254${p}`; // bare 7XXXXXXXX / 1XXXXXXXX
  return p;
};

// Parse Daraja's TransactionDate (yyyymmddHHMMSS as number/string) to a Date.
const parseMpesaDate = (v) => {
  const s = String(v || '');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date();
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
};

// Pull a value out of the STK callback metadata array by name.
const metaValue = (items, name) => items?.find(i => i.Name === name)?.Value;

// Apply the platform commission split to a settled payment.
const applyCommissionSplit = async (payment) => {
  try {
    const feePercent = await configService.getNumber('PLATFORM_RENT_FEE_PERCENT', 5);
    payment.commissionRate = feePercent;
    payment.platformFee = Math.round(payment.amount * feePercent / 100);
    payment.landlordShare = Math.max(0, payment.amount - payment.platformFee);
    payment.netToVendor = 0; // rent payments do not credit vendors directly
    return payment.save();
  } catch (err) {
    logger.error(`COMMISSION_SPLIT_FAILURE: ${err.message}`);
    // Don't block settlement if commission math fails.
    return payment;
  }
};

// Best-effort broadcast of payment status to tenant and landlord.
const broadcastPaymentStatus = (payment, extra = {}) => {
  try {
    const tenantId = payment.tenant?._id?.toString() || payment.tenant?.toString();
    const landlordId = payment.landlord?._id?.toString() || payment.landlord?.toString();
    const payload = {
      transactionId: payment._id,
      status: payment.status,
      amount: payment.amount,
      channel: payment.channel,
      timestamp: new Date(),
      ...extra
    };
    if (tenantId) sendToUser(tenantId, 'payment:status', payload);
    if (landlordId) sendToUser(landlordId, 'payment:status', payload);
  } catch (wsErr) {
    logger.error(`WS_PAYMENT_BROADCAST_FAILURE: ${wsErr.message}`);
  }
};

// Best-effort invoice settlement — prefers the bound invoice, else oldest open.
// Never throws into the payment flow.
const settleInvoiceForPayment = async (payment) => {
  try {
    await invoiceService.settleForPayment({
      invoiceId: payment.invoice,
      tenant: payment.tenant,
      property: payment.property,
      payment
    });
  } catch (err) {
    console.error('INVOICE_SETTLEMENT_FAILURE:', err);
  }
};

// Resolve property, landlord and the authoritative amount for a payment.
// Invoice payments are capped at the outstanding balance; the client may pay
// it in full (default) or send a smaller `amount` for a partial payment.
const isValidObjectId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;

const resolvePaymentContext = async ({ tenantId, invoiceId, propertyId, amount }) => {
  if (invoiceId) {
    if (!isValidObjectId(invoiceId)) {
      return { error: { status: 400, message: 'Invalid invoice identifier' } };
    }
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return { error: { status: 404, message: 'Invoice not found' } };
    if (tenantId && String(invoice.tenant) !== String(tenantId)) {
      return { error: { status: 403, message: 'This invoice does not belong to you' } };
    }
    if (!['issued', 'sent', 'overdue', 'partially_paid'].includes(invoice.status)) {
      return { error: { status: 409, message: `Invoice is already ${invoice.status}` } };
    }
    const balance = Math.round((invoice.total || 0) - (invoice.amountPaid || 0));
    let payAmount = balance;
    if (amount != null && amount !== '') {
      payAmount = Math.round(Number(amount));
      if (!Number.isInteger(payAmount) || payAmount < MIN_PAYMENT_AMOUNT) {
        return { error: { status: 400, message: 'Amount must be a whole number of at least KES 1' } };
      }
      if (payAmount > balance) {
        return { error: { status: 400, message: `Amount exceeds the outstanding balance of KES ${balance.toLocaleString()}` } };
      }
    }
    return {
      invoice,
      property: invoice.property,
      landlord: invoice.landlord,
      amount: payAmount
    };
  }

  // Ad-hoc rent payment: use the given property, else the tenant's active lease.
  let property = propertyId;
  let landlord;
  if (property && !isValidObjectId(property)) {
    return { error: { status: 400, message: 'Invalid property identifier' } };
  }
  if (!property) {
    const lease = await Lease.findOne({ tenant: tenantId, status: 'active' });
    if (lease) { property = lease.property; landlord = lease.landlord; }
  }
  if (!property) return { error: { status: 400, message: 'No property or active lease found for this payment' } };
  if (!landlord) {
    const prop = await Property.findById(property);
    landlord = prop?.landlord;
  }
  if (!landlord) return { error: { status: 400, message: 'Could not determine the landlord for this property' } };
  return { property, landlord, amount: Math.round(Number(amount)) };
};

// ---- controllers ----------------------------------------------------------

// Initiate an M-Pesa STK push for a rent payment. Creates a pending Payment
// (bound to an invoice when one is being paid) and asks Safaricom to prompt
// the tenant. Settlement happens later in mpesaCallback.
exports.initiateStkPush = async (req, res) => {
  try {
    const { phone, phoneNumber, amount, propertyId, invoiceId, accountReference } = req.body;
    const payerPhone = normalizePhone(phoneNumber || phone);

    if (!/^254(7|1)\d{8}$/.test(payerPhone)) {
      return res.status(400).json({ error: 'A valid Kenyan phone number is required' });
    }

    // Fast-fail on an obviously invalid client amount for ad-hoc payments.
    // Invoice payments validate the amount against the outstanding balance in
    // resolvePaymentContext (partial payments are allowed, overpayment is not).
    if (!invoiceId) {
      const amt = Math.round(Number(amount));
      if (!Number.isInteger(amt) || amt < MIN_PAYMENT_AMOUNT) {
        return res.status(400).json({ error: 'Amount must be a whole number of at least KES 1' });
      }
    }

    const ctx = await resolvePaymentContext({
      tenantId: req.user.id, invoiceId, propertyId, amount
    });
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });

    if (!Number.isInteger(ctx.amount) || ctx.amount < MIN_PAYMENT_AMOUNT) {
      return res.status(400).json({ error: 'Amount must be a whole number of at least KES 1' });
    }

    if (!mpesaService.isConfigured()) {
      return res.status(503).json({
        error: 'M-Pesa is not configured on the server',
        fallback: 'Pay via USSD *544#'
      });
    }

    // Create the pending payment first so we always have a record, even if the
    // STK request or the user drops off.
    const payment = await Payment.create({
      tenant: req.user.id,
      landlord: ctx.landlord,
      property: ctx.property,
      amount: ctx.amount,
      phoneUsed: payerPhone,
      status: 'pending',
      accountingCode: 'RENT',
      ...(invoiceId && { invoice: invoiceId })
    });

    logger.info('PAYMENT_INITIATED', {
      paymentId: payment._id,
      tenant: req.user.id,
      landlord: ctx.landlord,
      amount: ctx.amount,
      invoiceId,
      propertyId,
      payerPhone
    });

    // AccountReference is capped at 12 chars by Daraja; prefer the invoice
    // number, else the client ref, else the payment id.
    const reference = String(
      ctx.invoice?.invoiceNumber || accountReference || `RENT${payment._id.toString().slice(-8)}`
    ).slice(0, 12);

    try {
      const stk = await mpesaService.initiateSTKPush(payerPhone, ctx.amount, reference);
      payment.mpesaRequestId = stk.CheckoutRequestID;
      await payment.save();

      broadcastPaymentStatus(payment, { checkoutRequestId: stk.CheckoutRequestID, event: 'stk_pending' });

      return res.status(202).json({
        success: true,
        status: 'pending',
        transactionId: payment._id,
        checkoutRequestId: stk.CheckoutRequestID,
        message: 'STK push sent. Enter your M-Pesa PIN to complete payment.'
      });
    } catch (stkErr) {
      // The STK request itself failed — mark the payment failed but keep it so
      // the client can convert it to a Paybill fallback (POST /mpesa/paybill).
      payment.status = 'failed';
      payment.failureReason = stkErr.message || 'STK push failed';
      await payment.save();
      broadcastPaymentStatus(payment, { event: 'stk_failed', failureReason: payment.failureReason });
      console.error('MPESA_STK_FAILURE:', stkErr.message);
      return res.status(502).json({
        success: false,
        error: 'Could not reach M-Pesa via STK push.',
        fallbackAvailable: true,
        paymentId: payment._id,
        fallback: 'Pay to our Paybill instead'
      });
    }
  } catch (err) {
    console.error('PAYMENT_INITIATION_FAILURE:', err);
    return res.status(500).json({ error: 'Payment initiation failed' });
  }
};

// Legacy alias for the older POST /payments/mpesa route.
exports.payRent = exports.initiateStkPush;

// Landlord/manager/agent prompts the tenant's phone with an M-Pesa STK push
// for an invoice they own — the full outstanding balance by default, or a
// partial `amount`. The prompt lands on the TENANT's phone; settlement is the
// same STK callback path as a tenant-initiated payment.
exports.promptTenantStkPush = async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    // tenantId: null — ownership is checked against the landlord below.
    const ctx = await resolvePaymentContext({ tenantId: null, invoiceId, amount });
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });

    if (String(ctx.invoice.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'This invoice does not belong to you' });
    }

    const tenant = await User.findById(ctx.invoice.tenant).select('phone firstName');
    const tenantPhone = normalizePhone(tenant?.phone);
    if (!/^254(7|1)\d{8}$/.test(tenantPhone)) {
      return res.status(400).json({ error: "The tenant's phone number is missing or invalid" });
    }

    if (!mpesaService.isConfigured()) {
      return res.status(503).json({
        error: 'M-Pesa is not configured on the server',
        fallback: 'Ask the tenant to pay via USSD *544#'
      });
    }

    const payment = await Payment.create({
      tenant: ctx.invoice.tenant,
      landlord: ctx.invoice.landlord,
      property: ctx.property,
      amount: ctx.amount,
      phoneUsed: tenantPhone,
      status: 'pending',
      accountingCode: 'RENT',
      invoice: invoiceId,
      initiatedBy: req.user.id
    });

    const reference = String(ctx.invoice.invoiceNumber || `RENT${payment._id.toString().slice(-8)}`).slice(0, 12);

    try {
      const stk = await mpesaService.initiateSTKPush(tenantPhone, ctx.amount, reference);
      payment.mpesaRequestId = stk.CheckoutRequestID;
      await payment.save();

      return res.status(202).json({
        success: true,
        status: 'pending',
        transactionId: payment._id,
        checkoutRequestId: stk.CheckoutRequestID,
        message: `STK push sent to ${tenant.firstName || 'the tenant'}'s phone (${tenantPhone.replace(/^(2547\d{2}|2541\d{2})\d{4}/, '$1****')}).`
      });
    } catch (stkErr) {
      payment.status = 'failed';
      payment.failureReason = stkErr.message || 'STK push failed';
      await payment.save();
      console.error('MPESA_PROMPT_FAILURE:', stkErr.message);
      return res.status(502).json({
        success: false,
        error: 'Could not reach M-Pesa via STK push. Ask the tenant to try from their app.'
      });
    }
  } catch (err) {
    console.error('PAYMENT_PROMPT_FAILURE:', err);
    return res.status(500).json({ error: 'Payment prompt failed' });
  }
};

// M-Pesa STK callback. Always responds 200 to Safaricom once handled so they
// don't retry a payment we've already recorded.
exports.mpesaCallback = async (req, res) => {
  const stk = req.body?.Body?.stkCallback;
  if (!stk || typeof stk.CheckoutRequestID === 'undefined') {
    return res.status(400).json({ error: 'Malformed callback' });
  }

  const items = stk.CallbackMetadata?.Item || [];
  const receipt = metaValue(items, 'MpesaReceiptNumber');
  const cbAmount = Math.round(Number(metaValue(items, 'Amount')));

  // Basic callback validation and audit trail.
  logger.info('MPESA_CALLBACK_RECEIVED', {
    checkoutRequestId: stk.CheckoutRequestID,
    resultCode: stk.ResultCode,
    receipt,
    amount: cbAmount,
    sourceIp: req?.ip || req?.connection?.remoteAddress
  });

  try {
    const payment = await Payment.findOne({ mpesaRequestId: stk.CheckoutRequestID });
    if (!payment) {
      // Not a rent payment — check whether this is a subscription upgrade
      // payment instead (same Daraja shortcode, one shared callback URL).
      const handled = await require('./subscription.controller').handleMpesaCallback(stk);
      if (handled) return res.status(200).end();
      console.error('MPESA_CALLBACK_NO_MATCH:', stk.CheckoutRequestID);
      return res.status(404).end();
    }

    // Ignore duplicate callbacks for an already-settled payment.
    if (['completed', 'verified'].includes(payment.status)) {
      return res.status(200).end();
    }

    // Idempotency: a receipt may only be used once, even across different
    // CheckoutRequestIDs, to prevent replay attacks.
    if (receipt) {
      const existingReceipt = await Payment.findOne({ mpesaReceipt: receipt, _id: { $ne: payment._id } });
      if (existingReceipt) {
        logger.warn('MPESA_CALLBACK_DUPLICATE_RECEIPT', { receipt, paymentId: payment._id });
        return res.status(200).end();
      }
    }

    if (stk.ResultCode === 0) {
      // Validate amount matches the pending intent (tolerate nothing — exact match).
      if (Number.isFinite(cbAmount) && cbAmount !== payment.amount) {
        logger.warn('MPESA_CALLBACK_AMOUNT_MISMATCH', {
          paymentId: payment._id,
          expected: payment.amount,
          received: cbAmount
        });
        payment.status = 'failed';
        payment.failureReason = `Amount mismatch: expected KES ${payment.amount}, received KES ${cbAmount}`;
        await payment.save();
        return res.status(200).end();
      }

      payment.mpesaReceipt = receipt;
      const cbPhone = metaValue(items, 'PhoneNumber');
      if (cbPhone) payment.phoneUsed = normalizePhone(cbPhone);
      payment.mpesaTransactionDate = parseMpesaDate(metaValue(items, 'TransactionDate'));
      payment.status = 'completed';
      await applyCommissionSplit(payment);

      logger.info('MPESA_CALLBACK_SETTLED', {
        paymentId: payment._id,
        receipt,
        amount: payment.amount,
        landlordShare: payment.landlordShare,
        platformFee: payment.platformFee
      });

      // Settle the bound/open invoice, then email a receipt — both best-effort.
      await settleInvoiceForPayment(payment);

      // Real-time WebSocket broadcast to tenant and landlord
      broadcastPaymentStatus(payment, { mpesaReceipt: payment.mpesaReceipt, tenantName: payment.tenant?.firstName });

      try {
        await payment.populate('tenant property');
        await emailService.sendPaymentConfirmation(payment, payment.tenant);
      } catch (emailError) {
        console.error('Failed to send payment confirmation email:', emailError.message);
      }
    } else {
      payment.status = 'failed';
      payment.failureReason = stk.ResultDesc;
      await payment.save();
      broadcastPaymentStatus(payment, { event: 'callback_failed', failureReason: payment.failureReason });
    }

    return res.status(200).end();
  } catch (err) {
    // Log for manual reconciliation — Safaricom will retry on a non-200.
    console.error('MPESA_CALLBACK_FAILURE:', err);
    return res.status(500).end();
  }
};

// Poll a payment's status (used by the web after STK push). Maps the internal
// lifecycle onto the simple success/pending/failed the client expects.
exports.checkPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    // The paying tenant or the landlord who prompted it may poll the status.
    const requester = String(req.user.id);
    if (requester !== String(payment.tenant) && requester !== String(payment.landlord)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const map = {
      completed: 'success',
      verified: 'success',
      failed: 'failed',
      refunded: 'failed',
      expired: 'failed'
    };
    const status = map[payment.status] || 'pending';

    return res.status(200).json({
      status,
      transactionId: payment._id,
      mpesaReceipt: payment.mpesaReceipt,
      amount: payment.amount,
      invoiceId: payment.invoice,
      message: status === 'success'
        ? 'Payment completed successfully'
        : status === 'failed'
          ? (payment.failureReason || 'Payment failed')
          : 'Payment is being processed'
    });
  } catch (err) {
    console.error('PAYMENT_STATUS_FAILURE:', err);
    return res.status(500).json({ error: 'Failed to fetch payment status' });
  }
};

// ---- M-Pesa C2B Paybill fallback ------------------------------------------

// Issue a Paybill + unique expiring account number for a payment, used when
// STK push fails. Accepts an existing (failed) paymentId to convert in place,
// or the same context inputs as initiateStkPush to create a fresh intent.
exports.requestPaybillFallback = async (req, res) => {
  try {
    const { paymentId, invoiceId, propertyId, amount, phone, phoneNumber } = req.body;
    let payment;

    if (paymentId) {
      payment = await Payment.findById(paymentId);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (String(payment.tenant) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (['completed', 'verified'].includes(payment.status)) {
        return res.status(409).json({ error: 'Payment already settled' });
      }
    } else {
      const ctx = await resolvePaymentContext({ tenantId: req.user.id, invoiceId, propertyId, amount });
      if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
      if (!Number.isInteger(ctx.amount) || ctx.amount < MIN_PAYMENT_AMOUNT) {
        return res.status(400).json({ error: 'Amount must be a whole number of at least KES 1' });
      }
      payment = await Payment.create({
        tenant: req.user.id,
        landlord: ctx.landlord,
        property: ctx.property,
        amount: ctx.amount,
        phoneUsed: normalizePhone(phoneNumber || phone) || undefined,
        status: 'pending',
        accountingCode: 'RENT',
        ...(invoiceId && { invoice: invoiceId })
      });
    }

    // Convert to a time-boxed C2B Paybill intent.
    payment.channel = 'C2B_PAYBILL';
    payment.paymentMethod = 'MPESA';
    payment.status = 'pending';
    payment.failureReason = undefined;
    payment.accountRef = await generateUniqueAccountRef(Payment);
    payment.expiresAt = new Date(Date.now() + C2B_TTL_MS);
    await payment.save();
    broadcastPaymentStatus(payment, { event: 'paybill_pending', accountRef: payment.accountRef, expiresAt: payment.expiresAt });

    const paybill = process.env.MPESA_C2B_SHORTCODE || process.env.MPESA_SHORTCODE;
    const minutes = Math.round(C2B_TTL_MS / 60000);

    // Best-effort SMS the details to the tenant.
    if (payment.phoneUsed) {
      try {
        await smsService.sendSMS(
          payment.phoneUsed,
          `NyumbaSync: Pay KES ${payment.amount} to Paybill ${paybill}, Account ${payment.accountRef}. Expires in ${minutes} min.`
        );
      } catch (smsErr) {
        console.error('PAYBILL_SMS_FAILURE:', smsErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      paymentId: payment._id,
      paybill,
      accountRef: payment.accountRef,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
      expiresInMinutes: minutes,
      message: `Pay KES ${payment.amount} to Paybill ${paybill}, account ${payment.accountRef}.`
    });
  } catch (err) {
    console.error('PAYBILL_FALLBACK_FAILURE:', err);
    return res.status(500).json({ error: 'Could not generate Paybill details' });
  }
};

// C2B Validation — Safaricom calls this before completing a Paybill payment.
// Accept only a known, pending, unexpired account number with an exact amount
// match; otherwise reject so the payment is cancelled.
exports.c2bValidation = async (req, res) => {
  try {
    const ref = String(req.body.BillRefNumber || '').toUpperCase().trim();
    const amount = Math.round(Number(req.body.TransAmount));
    const payment = await Payment.findOne({ accountRef: ref, channel: 'C2B_PAYBILL' });
    const ok = payment
      && payment.status === 'pending'
      && (!payment.expiresAt || payment.expiresAt > new Date())
      && amount === payment.amount;

    logger.info('MPESA_C2B_VALIDATION', {
      ref,
      amount,
      expected: payment?.amount,
      accepted: !!ok,
      sourceIp: req?.ip || req?.connection?.remoteAddress
    });

    if (ok) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    return res.status(200).json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid or expired account number' });
  } catch (err) {
    console.error('C2B_VALIDATION_FAILURE:', err);
    return res.status(200).json({ ResultCode: 'C2B00016', ResultDesc: 'Validation error' });
  }
};

// C2B Confirmation — Safaricom calls this once a Paybill payment completes.
// Settle the matching intent, or auto-reverse if it's expired/unknown. Always
// 200 so Safaricom does not retry.
exports.c2bConfirmation = async (req, res) => {
  try {
    const ref = String(req.body.BillRefNumber || '').toUpperCase().trim();
    const receipt = req.body.TransID;
    const amount = Math.round(Number(req.body.TransAmount));
    const payment = await Payment.findOne({ accountRef: ref, channel: 'C2B_PAYBILL' });
    const valid = payment
      && payment.status === 'pending'
      && (!payment.expiresAt || payment.expiresAt > new Date())
      && amount === payment.amount;

    logger.info('MPESA_C2B_CONFIRMATION', {
      ref,
      receipt,
      amount,
      expected: payment?.amount,
      accepted: !!valid,
      sourceIp: req?.ip || req?.connection?.remoteAddress
    });

    // Idempotency / replay protection: receipt must be unique.
    if (receipt) {
      const existingReceipt = await Payment.findOne({ mpesaReceipt: receipt, _id: { $ne: payment?._id } });
      if (existingReceipt) {
        logger.warn('MPESA_C2B_DUPLICATE_RECEIPT', { receipt, ref });
        return res.status(200).json({ ResultCode: 0, ResultDesc: 'Confirmation received' });
      }
    }

    if (valid) {
      payment.mpesaReceipt = receipt;
      if (req.body.MSISDN) payment.phoneUsed = normalizePhone(String(req.body.MSISDN));
      payment.mpesaTransactionDate = parseMpesaDate(req.body.TransTime);
      payment.status = 'completed';
      await applyCommissionSplit(payment);

      logger.info('MPESA_C2B_SETTLED', {
        paymentId: payment._id,
        receipt,
        amount: payment.amount,
        landlordShare: payment.landlordShare,
        platformFee: payment.platformFee
      });

      await settleInvoiceForPayment(payment);

      // Real-time WebSocket broadcast to tenant and landlord
      broadcastPaymentStatus(payment, { mpesaReceipt: payment.mpesaReceipt, tenantName: payment.tenant?.firstName });

      try {
        await payment.populate('tenant property');
        await emailService.sendPaymentConfirmation(payment, payment.tenant);
      } catch (emailErr) {
        console.error('Failed to send payment confirmation email:', emailErr.message);
      }
    } else {
      // Paid after the account number expired (or to an unknown ref) → reverse.
      if (payment) {
        payment.status = 'failed';
        payment.failureReason = 'Payment arrived after the account reference expired';
        await payment.save();
        broadcastPaymentStatus(payment, { event: 'c2b_expired', failureReason: payment.failureReason });
      }
      await autoReverseLatePayment({ receipt, amount, ref, payment });
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Confirmation received' });
  } catch (err) {
    console.error('C2B_CONFIRMATION_FAILURE:', err);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Received' });
  }
};

// Reverse a payment that arrived too late (best-effort; needs reversal creds).
const autoReverseLatePayment = async ({ receipt, amount, ref, payment }) => {
  try {
    if (!receipt) return;
    if (!mpesaService.isReversalConfigured()) {
      console.error('REVERSAL_NOT_CONFIGURED — cannot auto-reverse receipt', receipt, 'ref', ref);
      return;
    }
    const result = await mpesaService.reverseTransaction({
      transactionId: receipt,
      amount,
      remarks: `Auto-reversal: payment to expired/unknown account ${ref}`
    });
    if (payment) {
      payment.reversal = {
        requested: true,
        reason: `Paid after expiry on ${ref}`,
        mpesaReversalId: result?.ConversationID
      };
      await payment.save();
    }
    console.error('AUTO_REVERSAL_INITIATED for receipt', receipt, 'ref', ref);
  } catch (err) {
    console.error('AUTO_REVERSAL_FAILURE:', err.message);
  }
};

// ---- Bank transfer (manual landlord confirmation) -------------------------

// Resolve where a tenant should send a bank transfer: the landlord's primary
// bank account, else a configured business account.
const resolveBankDetails = async (landlordId) => {
  try {
    const profile = await LandlordProfile.findOne({ user: landlordId });
    const accounts = profile?.bankAccounts || [];
    const acct = accounts.find(a => a.isPrimary && a.status === 'active') || accounts[0];
    if (acct?.accountNumber) {
      return { bankName: acct.bankName, accountNumber: acct.accountNumber, accountName: acct.accountName };
    }
  } catch (err) {
    console.error('BANK_DETAILS_LOOKUP_FAILURE:', err.message);
  }
  // Business-account fallback.
  if (process.env.BANK_ACCOUNT_NUMBER) {
    return {
      bankName: process.env.BANK_NAME,
      accountNumber: process.env.BANK_ACCOUNT_NUMBER,
      accountName: process.env.BANK_ACCOUNT_NAME
    };
  }
  return null;
};

// Issue bank-transfer instructions: a pending Payment with a unique reference
// the tenant must quote, plus the destination account details.
exports.initiateBankPayment = async (req, res) => {
  try {
    const { invoiceId, propertyId, amount } = req.body;
    const ctx = await resolvePaymentContext({ tenantId: req.user.id, invoiceId, propertyId, amount });
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
    if (!Number.isInteger(ctx.amount) || ctx.amount < MIN_PAYMENT_AMOUNT) {
      return res.status(400).json({ error: 'Amount must be a whole number of at least KES 1' });
    }

    const bank = await resolveBankDetails(ctx.landlord);
    if (!bank) return res.status(503).json({ error: 'No bank account is configured to receive payments' });

    const payment = await Payment.create({
      tenant: req.user.id,
      landlord: ctx.landlord,
      property: ctx.property,
      amount: ctx.amount,
      status: 'pending',
      channel: 'BANK',
      paymentMethod: 'BANK',
      accountingCode: 'RENT',
      accountRef: await generateUniqueAccountRef(Payment, { prefix: 'BT' }),
      expiresAt: new Date(Date.now() + BANK_TTL_MS),
      ...(invoiceId && { invoice: invoiceId })
    });
    broadcastPaymentStatus(payment, { event: 'bank_pending', accountRef: payment.accountRef, expiresAt: payment.expiresAt });

    return res.status(201).json({
      success: true,
      paymentId: payment._id,
      reference: payment.accountRef,
      amount: payment.amount,
      bank,
      expiresAt: payment.expiresAt,
      message: `Transfer KES ${payment.amount} to ${bank.bankName} A/C ${bank.accountNumber} using reference ${payment.accountRef}, then submit your bank reference.`
    });
  } catch (err) {
    console.error('BANK_INITIATE_FAILURE:', err);
    return res.status(500).json({ error: 'Could not start bank payment' });
  }
};

// Tenant submits the bank transaction reference they got from their bank.
// Moves the payment to pending_verification and notifies the landlord.
exports.submitBankReference = async (req, res) => {
  try {
    const { paymentId, reference } = req.body;
    if (!reference || String(reference).trim().length < 3) {
      return res.status(400).json({ error: 'A valid bank reference is required' });
    }
    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.tenant) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (payment.channel !== 'BANK' || !['pending', 'pending_verification'].includes(payment.status)) {
      return res.status(409).json({ error: `Cannot submit a reference for a ${payment.status} payment` });
    }

    payment.submittedReference = String(reference).trim();
    payment.status = 'pending_verification';
    await payment.save();
    broadcastPaymentStatus(payment, { event: 'bank_reference_submitted', submittedReference: payment.submittedReference });

    // Best-effort notify the landlord to verify against their statement.
    try {
      const landlord = await User.findById(payment.landlord).select('phone');
      if (landlord?.phone) {
        await smsService.sendSMS(
          landlord.phone,
          `NyumbaSync: A tenant submitted bank reference ${payment.submittedReference} for KES ${payment.amount} (ours: ${payment.accountRef}). Verify it in your dashboard.`
        );
      }
    } catch (notifyErr) {
      console.error('BANK_NOTIFY_FAILURE:', notifyErr.message);
    }

    return res.status(200).json({ success: true, status: 'pending_verification', message: 'Reference submitted. Awaiting landlord confirmation.' });
  } catch (err) {
    console.error('BANK_SUBMIT_FAILURE:', err);
    return res.status(500).json({ error: 'Could not submit bank reference' });
  }
};

// Landlord: list bank payments awaiting their verification.
exports.listPendingVerification = async (req, res) => {
  try {
    const payments = await Payment.find({ landlord: req.user.id, channel: 'BANK', status: 'pending_verification' })
      .populate('tenant', 'firstName lastName phone')
      .populate('property', 'title address')
      .sort({ updatedAt: -1 });
    return res.status(200).json(payments);
  } catch (err) {
    console.error('PENDING_VERIFICATION_FAILURE:', err);
    return res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
};

// Landlord: approve or reject a submitted bank payment after checking their
// statement. Approve settles the invoice; reject marks it failed.
exports.verifyPayment = async (req, res) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.landlord) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (payment.status !== 'pending_verification') {
      return res.status(409).json({ error: `Payment is ${payment.status}, not awaiting verification` });
    }

    if (action === 'approve') {
      payment.status = 'completed';
      payment.mpesaTransactionDate = payment.mpesaTransactionDate || new Date();
      await applyCommissionSplit(payment);
      await settleInvoiceForPayment(payment);

      // Real-time WebSocket broadcast to tenant and landlord
      broadcastPaymentStatus(payment);

      try {
        await payment.populate('tenant property');
        await emailService.sendPaymentConfirmation(payment, payment.tenant);
      } catch (e) { console.error('Receipt email failed:', e.message); }
      return res.status(200).json({ success: true, status: 'completed' });
    }

    if (action === 'reject') {
      payment.status = 'failed';
      payment.failureReason = req.body.reason || 'Bank reference could not be verified';
      await payment.save();
      broadcastPaymentStatus(payment, { event: 'bank_rejected', failureReason: payment.failureReason });
      return res.status(200).json({ success: true, status: 'failed' });
    }

    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  } catch (err) {
    console.error('VERIFY_PAYMENT_FAILURE:', err);
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

// ---- Card via gateway-hosted 3-D Secure -----------------------------------

// Start a hosted card checkout. Creates a pending Payment, asks the gateway for
// a checkout URL, and returns it for the client to redirect to. The gateway
// (and the issuing bank) run the card form + 3-D Secure / OTP.
exports.initiateCardPayment = async (req, res) => {
  try {
    if (!cardGateway.isConfigured()) {
      return res.status(503).json({ error: 'Card payments are not configured on the server' });
    }
    const { invoiceId, propertyId, amount } = req.body;
    const ctx = await resolvePaymentContext({ tenantId: req.user.id, invoiceId, propertyId, amount });
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
    if (!Number.isInteger(ctx.amount) || ctx.amount < MIN_PAYMENT_AMOUNT) {
      return res.status(400).json({ error: 'Amount must be a whole number of at least KES 1' });
    }

    const tenant = await User.findById(req.user.id).select('email firstName');
    if (!tenant?.email) {
      return res.status(400).json({ error: 'An email address is required for card payments' });
    }

    const payment = await Payment.create({
      tenant: req.user.id,
      landlord: ctx.landlord,
      property: ctx.property,
      amount: ctx.amount,
      status: 'pending',
      channel: 'CARD',
      paymentMethod: 'CARD',
      accountingCode: 'RENT',
      accountRef: await generateUniqueAccountRef(Payment, { prefix: 'CD' }),
      ...(invoiceId && { invoice: invoiceId })
    });

    const init = await cardGateway.initializeTransaction({
      email: tenant.email,
      amount: payment.amount,
      reference: payment.accountRef,
      callbackUrl: process.env.CARD_RETURN_URL,
      metadata: { paymentId: String(payment._id), tenant: String(req.user.id) }
    });

    payment.mpesaRequestId = init.reference; // reuse as the gateway reference
    await payment.save();
    broadcastPaymentStatus(payment, { event: 'card_pending', authorizationUrl: init.authorizationUrl });

    return res.status(201).json({
      success: true,
      paymentId: payment._id,
      authorizationUrl: init.authorizationUrl,
      reference: payment.accountRef
    });
  } catch (err) {
    console.error('CARD_INITIATE_FAILURE:', err.response?.data || err.message);
    return res.status(502).json({ error: 'Could not start card payment' });
  }
};

// Gateway webhook — settle a card payment on a successful charge. The route
// must supply the raw body (Buffer) so the signature can be verified.
exports.cardWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    // Prefer the exact bytes captured at parse time (C13). Fall back to a raw
    // body (when the route's express.raw ran) or a re-stringify as last resort.
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));
    if (!cardGateway.verifyWebhookSignature(raw, signature)) {
      return res.status(401).end();
    }
    const event = JSON.parse(raw.toString());
    if (event.event !== 'charge.success') return res.status(200).end();

    const reference = event.data?.reference;
    const payment = await Payment.findOne({ accountRef: reference, channel: 'CARD' });
    if (payment && !['completed', 'verified'].includes(payment.status)) {
      payment.status = 'completed';
      payment.mpesaReceipt = undefined; // not an M-Pesa payment
      payment.mpesaTransactionDate = new Date();
      await applyCommissionSplit(payment);
      await settleInvoiceForPayment(payment);

      // Real-time WebSocket broadcast to tenant and landlord
      broadcastPaymentStatus(payment, { tenantName: payment.tenant?.firstName });

      try {
        await payment.populate('tenant property');
        await emailService.sendPaymentConfirmation(payment, payment.tenant);
      } catch (e) { console.error('Card receipt email failed:', e.message); }
    }
    return res.status(200).end();
  } catch (err) {
    console.error('CARD_WEBHOOK_FAILURE:', err.message);
    return res.status(200).end();
  }
};

// Get payment history for the authenticated tenant.
exports.paymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ tenant: req.user.id })
      .populate('property', 'title address')
      .sort({ createdAt: -1 });
    res.status(200).json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
};

// Placeholder for reconcilePayments
exports.reconcilePayments = (req, res) => {
  res.status(501).json({ message: 'Not implemented' });
};
