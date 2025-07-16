module.exports = (amount, phone) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: 'test-merchant-id',
      CheckoutRequestID: 'test-checkout-id',
      ResultCode: 0,
      ResultDesc: 'Success',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: amount },
          { Name: 'MpesaReceiptNumber', Value: 'TEST' + Math.random().toString(36).substr(2, 8) },
          { Name: 'PhoneNumber', Value: phone }
        ]
      }
    }
  }
});
