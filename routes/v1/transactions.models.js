const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // Reference to the property being paid for
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property', // Links to Property model
      required: true,
    },

    // Reference to the tenant/user making the payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Links to User model
      required: true,
    },

    // M-Pesa transaction details
    mpesa: {
      requestId: { type: String, unique: true }, // CheckoutRequestID from STK Push
      receiptNumber: { type: String }, // M-Pesa receipt number (e.g., 'NLJ7RT61SV')
      phone: { type: String, required: true }, // Format: 254712345678
      amount: { type: Number, required: true, min: 1 }, // KES
      transactionDate: { type: Date }, // Timestamp from M-Pesa callback
    },

    // Transaction metadata
    type: {
      type: String,
      enum: ['rent', 'deposit', 'maintenance', 'payout'], // Rent payment, security deposit, etc.
      default: 'rent',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    description: { type: String }, // Optional note (e.g., "June 2024 Rent")

    // For failed/reversed transactions
    error: {
      code: { type: String }, // e.g., '1032' (M-Pesa error code)
      message: { type: String }, // e.g., 'Request cancelled by user'
    },
  },
  { timestamps: true } // Adds createdAt and updatedAt fields
);

// Indexes for faster queries
transactionSchema.index({ userId: 1 });
transactionSchema.index({ propertyId: 1 });
transactionSchema.index({ 'mpesa.requestId': 1 }, { unique: true });
transactionSchema.index({ 'mpesa.receiptNumber': 1 }, { sparse: true });

// Pre-save hook to format phone numbers
transactionSchema.pre('save', function (next) {
  if (this.mpesa?.phone && !this.mpesa.phone.startsWith('254')) {
    this.mpesa.phone = `254${this.mpesa.phone.slice(-9)}`; // Convert 07... to 2547...
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);