const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },

  // M-Pesa specific fields
  mpesaReceipt: {
    type: String,
    match: /^[A-Z0-9]{10}$/ // NLJ7RT61SV
  },
  phoneUsed: {
    type: String,
    validate: {
      validator: v => /^2547\d{8}$/.test(v),
      message: 'Invalid M-Pesa number'
    }
  },

  // Kenyan shilling amounts
  amount: {
    type: Number,
    min: 100, // Minimum rent KES 100
    get: v => Math.round(v), // No cents
    set: v => Math.round(v)
  },

  // For Kenyan tax reporting
  invoiceNumber: {
    type: String,
    default: function() {
      return `INV-${Date.now()}-${this.property.toString().slice(-4)}`;
    }
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'pending'
  }
}, { timestamps: true });

// Index for faster rent queries
PaymentSchema.index({
  tenant: 1,
  property: 1,
  createdAt: -1
});

module.exports = mongoose.model('Payment', PaymentSchema);
