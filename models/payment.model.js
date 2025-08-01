const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentSchema = new Schema({
  // Transaction Parties
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Tenant reference is required'],
    validate: {
      validator: async function(id) {
        const user = await mongoose.model('User').findById(id);
        return user && user.role === 'tenant';
      },
      message: 'Referenced user must be a tenant'
    }
  },
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Landlord reference is required'],
    validate: {
      validator: async function(id) {
        const user = await mongoose.model('User').findById(id);
        return user && user.role === 'landlord';
      },
      message: 'Referenced user must be a landlord'
    }
  },
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },

  // Payment Details
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [100, 'Minimum payment is KES 100'],
    max: [1000000, 'Maximum payment is KES 1,000,000'],
    get: v => Math.round(v), // Store whole shillings only
    set: v => Math.round(v)
  },
  currency: {
    type: String,
    default: 'KES',
    enum: {
      values: ['KES'],
      message: 'Only Kenyan Shillings (KES) are accepted'
    }
  },

  // M-Pesa Specific Fields
  mpesaReceipt: {
    type: String,
    required: [true, 'M-Pesa receipt number is required'],
    uppercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^(?:[A-Z0-9]{10}|[A-Z0-9]{12})$/.test(v); // Standard 10-char or new 12-char receipts
      },
      message: 'Invalid M-Pesa receipt format'
    }
  },
  phoneUsed: {
    type: String,
    required: [true, 'Payer phone number is required'],
    validate: {
      validator: function(v) {
        return /^254(7|1)\d{8}$/.test(v); // Kenyan mobile format
      },
      message: 'Phone number must be in format 2547XXXXXXXX or 2541XXXXXXXX'
    }
  },
  mpesaTransactionDate: {
    type: Date,
    required: true
  },

  // Payment Context
  description: {
    type: String,
    default: function() {
      return `Rent payment for ${this.property?.title || 'property'}`;
    },
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  periodCovered: {
    from: Date,
    to: Date
  },

  // Payment Lifecycle
  status: {
    type: String,
    enum: {
      values: ['initiated', 'pending', 'completed', 'verified', 'disputed', 'refunded'],
      message: 'Invalid payment status'
    },
    default: 'initiated'
  },
  verificationDate: Date,
  disputedDate: Date,
  disputeReason: String,

  // Financial Tracking
  invoiceNumber: {
    type: String,
    unique: true,
    default: function() {
      const rand = Math.floor(1000 + Math.random() * 9000);
      return `INV-${new Date().getFullYear()}-${rand}-${this.property.toString().slice(-4)}`;
    }
  },
  accountingCode: {
    type: String,
    enum: ['RENT', 'DEPOSIT', 'UTILITY', 'PENALTY', 'OTHER'],
    default: 'RENT'
  },

  // System Metadata
  paymentMethod: {
    type: String,
    enum: ['MPESA', 'BANK', 'CASH', 'CARD'],
    default: 'MPESA'
  },
  initiatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// ========================
// INDEXES (Optimized for Kenyan Rental Payments)
// ========================
PaymentSchema.index({ tenant: 1, paymentDate: -1 }); // Tenant payment history
PaymentSchema.index({ landlord: 1, paymentDate: -1 }); // Landlord income tracking
PaymentSchema.index({ property: 1, paymentDate: -1 }); // Property payment records
PaymentSchema.index({ status: 1, paymentDate: -1 }); // Payment status monitoring
PaymentSchema.index({ mpesaReceipt: 1 }, { unique: true }); // Prevent duplicate M-Pesa payments
PaymentSchema.index({ phoneUsed: 1, paymentDate: -1 }); // Payment tracking by phone number
PaymentSchema.index({ 
  landlord: 1, 
  status: 1, 
  paymentDate: -1 
}); // Landlord dashboard view
PaymentSchema.index({
  tenant: 1,
  property: 1,
  paymentDate: -1
}); // Tenant-property payment history

// ========================
// VIRTUAL PROPERTIES
// ========================
PaymentSchema.virtual('formattedAmount').get(function() {
  return `KES ${this.amount?.toLocaleString('en-KE')}`;
});

PaymentSchema.virtual('isVerified').get(function() {
  return this.status === 'verified';
});

PaymentSchema.virtual('paymentPeriod').get(function() {
  if (!this.periodCovered?.from || !this.periodCovered?.to) return null;
  return `${this.periodCovered.from.toLocaleDateString('en-KE')} - ${this.periodCovered.to.toLocaleDateString('en-KE')}`;
});

PaymentSchema.virtual('mpesaConfirmation').get(function() {
  return `Confirmed. KES${this.amount} paid to ${this.property?.title || 'property'} via M-PESA. ${this.mpesaReceipt}`;
});

// ========================
// INSTANCE METHODS
// ========================
PaymentSchema.methods.initiateRefund = function(reason) {
  if (this.status !== 'completed' && this.status !== 'verified') {
    throw new Error('Only completed or verified payments can be refunded');
  }
  this.status = 'refunded';
  this.disputeReason = reason;
  this.disputedDate = new Date();
};

PaymentSchema.methods.verifyPayment = function() {
  if (this.status !== 'completed') {
    throw new Error('Only completed payments can be verified');
  }
  this.status = 'verified';
  this.verificationDate = new Date();
};

// ========================
// STATIC METHODS (Kenyan Context)
// ========================
PaymentSchema.statics.findByMpesaReceipt = function(receipt) {
  return this.findOne({ mpesaReceipt: receipt.toUpperCase() });
};

PaymentSchema.statics.getLandlordMonthlySummary = async function(landlordId, year) {
  const match = { 
    landlord: landlordId, 
    status: 'verified',
    paymentDate: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1)
    }
  };

  return this.aggregate([
    { $match: match },
    { 
      $group: {
        _id: { month: { $month: "$paymentDate" } },
        totalAmount: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
        properties: { $addToSet: "$property" }
      }
    },
    { $sort: { "_id.month": 1 } },
    {
      $project: {
        month: "$_id.month",
        totalAmount: 1,
        paymentCount: 1,
        propertyCount: { $size: "$properties" },
        _id: 0
      }
    }
  ]);
};

// ========================
// MIDDLEWARE
// ========================
PaymentSchema.pre('save', function(next) {
  // Auto-set period covered if not specified (default to current month)
  if (!this.periodCovered) {
    const now = new Date();
    this.periodCovered = {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
    };
  }

  // Normalize M-Pesa receipt number
  if (this.mpesaReceipt) {
    this.mpesaReceipt = this.mpesaReceipt.toUpperCase().trim();
  }

  // Set payment date if not specified
  if (!this.paymentDate) {
    this.paymentDate = new Date();
  }

  next();
});

PaymentSchema.post('save', async function(doc, next) {
  // Update property's last payment date
  if (doc.status === 'verified') {
    await mongoose.model('Property').updateOne(
      { _id: doc.property },
      { $set: { lastPayment: doc.paymentDate } }
    );
  }
  next();
});

module.exports = mongoose.model('Payment', PaymentSchema);