const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Vendor Wallet Model
 * Tracks earnings available for withdrawal for registered vendors.
 */
const vendorWalletSchema = new Schema({
  vendorUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  currency: {
    type: String,
    default: 'KES'
  },

  // Funds available for immediate withdrawal
  availableBalance: {
    type: Number,
    default: 0,
    min: 0
  },

  // Funds held until a job is closed / dispute window passes
  pendingBalance: {
    type: Number,
    default: 0,
    min: 0
  },

  // Lifetime earnings on the platform
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },

  // Default payout method
  payoutMethod: {
    type: {
      type: String,
      enum: ['mpesa', 'bank'],
      default: 'mpesa'
    },
    phone: String,
    bankName: String,
    accountName: String,
    accountNumber: String
  }
}, {
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// Ensure balances are always whole shillings.
vendorWalletSchema.path('availableBalance').set(v => Math.round(v));
vendorWalletSchema.path('pendingBalance').set(v => Math.round(v));
vendorWalletSchema.path('totalEarned').set(v => Math.round(v));

vendorWalletSchema.methods.credit = async function(amount, opts = {}) {
  const rounded = Math.round(Number(amount));
  if (rounded <= 0) return this;
  if (opts.pending) {
    this.pendingBalance += rounded;
  } else {
    this.availableBalance += rounded;
  }
  this.totalEarned += rounded;
  return this.save();
};

vendorWalletSchema.methods.releasePending = async function(amount) {
  const rounded = Math.round(Number(amount));
  if (rounded <= 0) return this;
  this.pendingBalance = Math.max(0, this.pendingBalance - rounded);
  this.availableBalance += rounded;
  return this.save();
};

module.exports = mongoose.model('VendorWallet', vendorWalletSchema);
