const axios = require('axios');
const Transaction = require('../models/transaction.model');
const { generateMpesaPassword, generateTimestamp } = require('../utils/mpesa.utils');

// Helper function to get M-Pesa auth token
async function getAuthToken() {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get(
    `${process.env.MPESA_AUTH_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  return response.data.access_token;
}

// STK Push (Customer to Paybill)
exports.initiateSTKPush = async (req, res) => {
  const { phone, amount, propertyId } = req.body;

  // Validate input
  if (!phone || !amount || !propertyId) {
    return res.status(400).json({ error: 'Missing phone, amount, or propertyId' });
  }

  try {
    const timestamp = generateTimestamp();
    const password = generateMpesaPassword(
      process.env.MPESA_SHORTCODE,
      process.env.MPESA_PASSKEY,
      timestamp
    );

    const response = await axios.post(
      `${process.env.MPESA_API_URL}/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: `254${phone.slice(-9)}`,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: `254${phone.slice(-9)}`,
        CallBackURL: `${process.env.API_BASE_URL}/v1/mpesa/callback`,
        AccountReference: `NyumbaSync-${propertyId}`,
        TransactionDesc: 'Rent Payment',
      },
      {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Save transaction to DB
    const transaction = new Transaction({
      propertyId,
      phone: `254${phone.slice(-9)}`,
      amount,
      mpesaRequestId: response.data.CheckoutRequestID,
      status: 'Pending',
    });
    await transaction.save();

    res.status(200).json(response.data);
  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
};

// Handle M-Pesa Callback
exports.handleCallback = async (req, res) => {
  const callbackData = req.body;

  try {
    const transaction = await Transaction.findOne({
      mpesaRequestId: callbackData.Body.stkCallback.CheckoutRequestID,
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (callbackData.Body.stkCallback.ResultCode === 0) {
      transaction.status = 'Completed';
      transaction.mpesaReceiptNumber = callbackData.Body.stkCallback.CallbackMetadata.Item[1].Value;
    } else {
      transaction.status = 'Failed';
      transaction.errorMessage = callbackData.Body.stkCallback.ResultDesc;
    }

    await transaction.save();
    res.status(200).send('Callback processed');
  } catch (error) {
    console.error('Callback Error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
};

// Query Transaction Status
exports.queryTransactionStatus = async (req, res) => {
  const { checkoutRequestId } = req.body;

  try {
    const response = await axios.get(
      `${process.env.MPESA_API_URL}/stkpushquery/v1/query?checkoutRequestID=${checkoutRequestId}`,
      {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      }
    );
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Query failed' });
  }
};

// B2C Payment (Landlord Payout)
exports.initiateB2CPayment = async (req, res) => {
  const { phone, amount, remarks } = req.body;

  try {
    const response = await axios.post(
      `${process.env.MPESA_API_URL}/b2c/v1/paymentrequest`,
      {
        InitiatorName: process.env.B2C_INITIATOR,
        SecurityCredential: process.env.B2C_SECURITY_CREDENTIAL,
        CommandID: 'BusinessPayment',
        Amount: amount,
        PartyA: process.env.B2C_SHORTCODE,
        PartyB: `254${phone.slice(-9)}`,
        Remarks: remarks || 'Rent payout',
        QueueTimeOutURL: `${process.env.API_BASE_URL}/v1/mpesa/b2c/timeout`,
        ResultURL: `${process.env.API_BASE_URL}/v1/mpesa/b2c/result`,
        Occasion: 'Rent payment',
      },
      {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.status(200).json(response.data);
  } catch (error) {
    console.error('B2C Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payout failed' });
  }
};