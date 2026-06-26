const mongoose = require('mongoose');

const MpesaTransactionSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        // Simple check for Kenyan Safaricom numbers
        return /^(\+254|254|0)7\d{8}$/.test(v);
      },
      message: props => `${props.value} is not a valid Safaricom phone number!`
    }
  },
  amount: {
    type: Number,
    required: true,
    min: [1, 'Amount must be greater than 0']
  },
  transactionType: {
    type: String,
    enum: ['STK_PUSH', 'B2C', 'C2B', 'Query'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING'
  },
  checkoutRequestID: String,
  merchantRequestID: String,
  resultCode: Number,
  resultDesc: String,
  receiptNumber: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional in some transactions
  }
});

const MpesaTransaction = mongoose.model('MpesaTransaction', MpesaTransactionSchema);

module.exports = MpesaTransaction;
