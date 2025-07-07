const axios = require('axios');
const Transaction = require('../models/transaction.model'); // Assuming a Mongoose model
const { generateMpesaPassword, generateTimestamp } = require('../utils/mpesa.utils');

// STK Push (Customer to Paybill)
exports.initiateSTKPush = async (req, res) => {
  const { phone, amount, propertyId } = req.body;

  // Validate input
  if (!phone || !amount || !propertyId) {
    return res.status(400).json({ error: 'Missing phone, amount, or propertyId' });
  }

  try {
    const timestamp = generateTimestamp();
    const password = generateMpesaPassword(process.env.MPESA_SHORTCODE, process.env.MPESA_PASSKEY, timestamp);

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: `254${phone.slice(-9)}`, // Format: 254712345678
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: `254${phone.slice(-9)}`,
        CallBackURL: `${process.env.API_BASE_URL}/v1/mpesa/callback`,
        AccountReference: `NyumbaSync-${propertyId}`,
        TransactionDesc: 'Rent Payment',
      },
      {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      }
    );

    // Save transaction to DB (Pending status)
    const transaction = new Transaction({
      propertyId,
      phone,
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

// Handle M-Pesa Callback (Update DB on success/failure)
exports.handleCallback = async (req, res) => {
  const callbackData = req.body;
  console.log('Callback Received:', callbackData);

  try {
    // Find transaction by CheckoutRequestID
    const transaction = await Transaction.findOne({
      mpesaRequestId: callbackData.Body.stkCallback.CheckoutRequestID,
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update status based on callback
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

// Query Transaction Status (Optional)
exports.queryTransactionStatus = async (req, res) => {
  const { checkoutRequestId } = req.body;
  try {
    const response = await axios.get(
      `https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query?checkoutRequestID=${checkoutRequestId}`,
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

// --- Helper Functions ---
async function getAuthToken() {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  return response.data.access_token;
}