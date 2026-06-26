const axios = require('axios');

// NOTE: STK-push rent collection (CustomerPayBill) and its callback used to
// live here on a Transaction-based prototype. That has been retired in favour
// of the canonical, invoice-aware flow under /payments/* (payment.controller +
// mpesa.service). This controller now only owns the M-Pesa surfaces that are
// unique to it: B2C landlord payouts and transaction-status queries.

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
