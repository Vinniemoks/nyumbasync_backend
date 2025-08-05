const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // Transaction identification
    transactionId: {
      type: String,
      unique: true,
      index: true,
      default: () => `TXN${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Related entities
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: function() {
        return ['rent', 'deposit', 'maintenance', 'payout'].includes(this.type);
      },
      index: true
    },

    // Transaction details
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    currency: {
      type: String,
      default: 'KES',
      enum: ['KES', 'USD']
    },
    type: {
      type: String,
      required: true,
      enum: ['rent', 'deposit', 'maintenance', 'payout', 'utility_bill', 'refund', 'other'],
      default: 'rent',
      index: true
    },
    description: {
      type: String,
      maxlength: 500
    },

    // Status tracking
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded', 'reversed'],
      default: 'pending',
      index: true
    },
    completedAt: Date,
    processedAt: Date,
    failureReason: {
      type: String,
      maxlength: 500
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Payment details
    paymentMethod: {
      type: String,
      required: true,
      enum: ['mpesa', 'bank_transfer', 'cash', 'cheque', 'card'],
      default: 'mpesa'
    },

    // M-Pesa specific fields
    mpesa: {
      requestId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
      },
      receiptNumber: {
        type: String,
        sparse: true,
        index: true
      },
      phone: {
        type: String,
        required: function() {
          return this.paymentMethod === 'mpesa';
        }
      },
      transactionId: {
        type: String,
        sparse: true
      },
      amount: {
        type: Number,
        min: 1
      },
      transactionDate: {
        type: Date
      }
    },

    // Reconciliation
    reconciled: {
      type: Boolean,
      default: false,
      index: true
    },
    reconciledAt: {
      type: Date
    },
    reconciledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ property: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ 'mpesa.receiptNumber': 1 }, { sparse: true });

// Virtuals
transactionSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toLocaleString()}`;
});

transactionSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  // Normalize phone number
  if (this.mpesa?.phone && !this.mpesa.phone.startsWith('254')) {
    this.mpesa.phone = `254${this.mpesa.phone.slice(-9)}`;
  }

  // Set processedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.processedAt) {
    this.processedAt = new Date();
    this.completedAt = this.processedAt;
  }

  next();
});

// Static methods
transactionSchema.statics.findByUserId = function(userId, options = {}) {
  const query = this.find({ user: userId });
  
  if (options.status) {
    query.where('status', options.status);
  }
  
  if (options.type) {
    query.where('type', options.type);
  }
  
  if (options.limit) {
    query.limit(options.limit);
  }
  
  return query.sort({ createdAt: -1 }).populate('property', 'name address');
};

transactionSchema.statics.findByPropertyId = function(propertyId, options = {}) {
  const query = this.find({ property: propertyId });
  
  if (options.status) {
    query.where('status', options.status);
  }
  
  return query.sort({ createdAt: -1 }).populate('user', 'name email phone');
};

transactionSchema.statics.getRevenueStats = async function(startDate, endDate) {
  const pipeline = [
    {
      $match: {
        status: 'completed',
        $or: [
          { processedAt: { $gte: startDate, $lte: endDate } },
          { completedAt: { $gte: startDate, $lte: endDate } }
        ]
      }
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Instance methods
transactionSchema.methods.markAsCompleted = function(paymentData = {}) {
  this.status = 'completed';
  this.processedAt = new Date();
  this.completedAt = this.processedAt;
  
  if (paymentData.receiptNumber) {
    this.mpesa.receiptNumber = paymentData.receiptNumber;
  }
  
  if (paymentData.transactionId) {
    this.mpesa.transactionId = paymentData.transactionId;
  }
  
  return this.save();
};

transactionSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.retryCount += 1;
  return this.save();
};

transactionSchema.methods.canRetry = function() {
  return this.status === 'failed' && this.retryCount < 3;
};

module.exports = mongoose.model('Transaction', transactionSchema);