const axios = require('axios');
const crypto = require('crypto');

// Card payment gateway adapter. Default implementation targets Paystack (strong
// Kenya support, hosted 3-D Secure / OTP). Kept behind this thin interface so a
// different gateway (Flutterwave, DPO, Stripe) can be swapped without touching
// the payment controller. The gateway hosts the card form + OTP, so raw card
// data never reaches our backend.

const BASE_URL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
const secret = () => process.env.PAYSTACK_SECRET_KEY;

const isConfigured = () => Boolean(secret());

// Start a hosted checkout. Returns the URL to redirect the payer to. Paystack
// amounts are in the minor unit (cents), so KES is multiplied by 100.
const initializeTransaction = async ({ email, amount, reference, callbackUrl, metadata }) => {
  const response = await axios.post(
    `${BASE_URL}/transaction/initialize`,
    {
      email,
      amount: Math.round(amount * 100),
      currency: process.env.PAYSTACK_CURRENCY || 'KES',
      reference,
      callback_url: callbackUrl,
      metadata
    },
    { headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const data = response.data?.data || {};
  return { authorizationUrl: data.authorization_url, reference: data.reference, accessCode: data.access_code };
};

// Confirm a transaction's final state directly with the gateway (used as a
// fallback to the webhook). Returns { status, amount } with amount in KES.
const verifyTransaction = async (reference) => {
  const response = await axios.get(
    `${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret()}` }, timeout: 10000 }
  );
  const data = response.data?.data || {};
  return {
    status: data.status === 'success' ? 'success' : (data.status === 'failed' ? 'failed' : 'pending'),
    amount: typeof data.amount === 'number' ? data.amount / 100 : undefined,
    raw: data
  };
};

// Verify a webhook came from the gateway. Paystack signs the raw request body
// with HMAC-SHA512 of the secret key, sent in the x-paystack-signature header.
const verifyWebhookSignature = (rawBody, signature) => {
  if (!secret() || !signature) return false;
  const hash = crypto.createHmac('sha512', secret()).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
};

module.exports = { isConfigured, initializeTransaction, verifyTransaction, verifyWebhookSignature };
