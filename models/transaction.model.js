const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // References
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },

    // M-Pesa Details
    mpesa: {
      requestId: { type: String, unique: true, sparse: true }, // STK Push ID
      receiptNumber: { type: String, sparse: true }, // e.g., 'NLJ7RT61SV'
      phone: { type: String }, // E.g., 254712345678
      amount: { type: Number, min: 1 }, // Redundant if main `amount` is used
      transactionDate: { type: Date },
    },

    // Main transaction fields
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    mpesaReceipt: { type: String },

    // Status
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    completedAt: Date,

    // Classification
    type: {
      type: String,
      enum: ['rent', 'deposit', 'maintenance', 'payout'],
      default: 'rent',
    },
    description: { type: String },

    // Error details
    error: {
      code: { type: String },
      message: { type: String },
    },
  },
  { timestamps: true }
);

// Indexes
transactionSchema.index({ user: 1 });
transactionSchema.index({ property: 1 });
transactionSchema.index({ reference: 1 }, { unique: true });
transactionSchema.index({ 'mpesa.requestId': 1 }, { unique: true, sparse: true });
transactionSchema.index({ 'mpesa.receiptNumber': 1 }, { sparse: true });

// Normalize phone number
transactionSchema.pre('save', function (next) {
  if (this.mpesa?.phone && !this.mpesa.phone.startsWith('254')) {
    this.mpesa.phone = `254${this.mpesa.phone.slice(-9)}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
