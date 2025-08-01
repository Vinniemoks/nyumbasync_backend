// In tests/mocks/mpesa.mock.js

// M-Pesa receipt generator (standalone function)
const generateMpesaReceipt = () => {
  // Format: 2 uppercase letters + 8 digits (matches real M-Pesa receipts)
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomLetter = () => letters.charAt(Math.floor(Math.random() * letters.length));
  return `${randomLetter()}${randomLetter()}${Math.floor(10000000 + Math.random() * 90000000)}`;
};

// Main mock callback generator (your existing functionality)
const mpesaCallback = (amount, phone) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: 'test-merchant-id',
      CheckoutRequestID: 'test-checkout-id',
      ResultCode: 0,
      ResultDesc: 'Success',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: amount },
          { Name: 'MpesaReceiptNumber', Value: generateMpesaReceipt() }, // Using the generator
          { Name: 'PhoneNumber', Value: phone }
        ]
      }
    }
  }
});

// Additional test utilities
const successfulPayment = (amount, phone) => ({
  receipt: generateMpesaReceipt(),
  callback: mpesaCallback(amount, phone)
});

module.exports = {
  callback: mpesaCallback,       
  generateReceipt: generateMpesaReceipt,
  successfulPayment              
};