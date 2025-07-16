const Payment = require('../models/payment.model');
const { initiateSTKPush } = require('../services/mpesa.service');

// Initiate rent payment
exports.payRent = async (req, res) => {
  try {
    const { phone, amount, propertyId } = req.body;

    // Kenyan shilling validation
    if (amount < 100 || !Number.isInteger(amount)) {
      return res.status(400).json({ 
        error: 'Amount must be whole KES ≥100' 
      });
    }

    // Create payment record
    const payment = await Payment.create({
      tenant: req.user.id,
      property: propertyId,
      amount,
      status: 'pending'
    });

    // Trigger M-Pesa STK push
    const mpesaResponse = await initiateSTKPush(
      phone, 
      amount,
      `Rent for ${propertyId}`
    );

    // Update with M-Pesa reference
    payment.mpesaRequestId = mpesaResponse.CheckoutRequestID;
    await payment.save();

    res.status(202).json({
      message: 'Payment request sent to M-Pesa',
      paymentId: payment._id
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Payment initiation failed',
      fallback: 'Pay via USSD *544#' 
    });
  }
};

// M-Pesa callback handler
exports.mpesaCallback = async (req, res) => {
  const callbackData = req.body.Body.stkCallback;
  
  try {
    const payment = await Payment.findOne({
      mpesaRequestId: callbackData.CheckoutRequestID
    });

    if (!payment) {
      return res.status(404).end();
    }

    if (callbackData.ResultCode === 0) {
      // Successful payment
      const metadata = callbackData.CallbackMetadata.Item;
      payment.status = 'completed';
      payment.mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber').Value;
      payment.phoneUsed = metadata.find(i => i.Name === 'PhoneNumber').Value;
      await payment.save();

      // TODO: Trigger receipt SMS
    } else {
      payment.status = 'failed';
      payment.failureReason = callbackData.ResultDesc;
      await payment.save();
    }

    res.status(200).end();
  } catch (err) {
    // Critical: Log for reconciliation
    console.error('MPESA_CALLBACK_FAILURE:', err);
    res.status(500).end();
  }
};
