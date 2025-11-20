const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const depositRefundSchema = new Schema({
  moveOutRequest: {
    type: Schema.Types.ObjectId,
    ref: 'MoveOutRequest',
    required: true
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  lease: {
    type: Schema.Types.ObjectId,
    ref: 'Lease',
    required: true
  },
  depositAmount: {
    type: Number,
    required: true
  },
  deductions: [{
    description: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    category: {
      type: String,
      enum: ['damage', 'cleaning', 'unpaid_rent', 'unpaid_utilities', 'other']
    },
    evidence: [String] // URLs to photos/documents
  }],
  refundAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['submitted', 'inspection', 'approved', 'rejected', 'processing', 'paid', 'cancelled'],
    default: 'submitted'
  },
  stages: [{
    stage: {
      type: String,
      enum: ['submitted', 'inspection', 'approved', 'paid']
    },
    completed: {
      type: Boolean,
      default: false
    },
    timestamp: Date,
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Bank details for refund
  bankDetails: {
    accountNumber: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true
    },
    accountName: {
      type: String,
      required: true
    },
    branchCode: String
  },
  // Payment details
  paymentDetails: {
    method: {
      type: String,
      enum: ['bank_transfer', 'mpesa', 'cheque']
    },
    transactionId: String,
    transactionDate: Date,
    reference: String,
    proofOfPayment: String // URL to receipt/proof
  },
  // Approval
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  // Processing
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  paidAt: Date,
  // Notes
  notes: String
}, {
  timestamps: true
});

// Indexes
depositRefundSchema.index({ tenant: 1, status: 1 });
depositRefundSchema.index({ moveOutRequest: 1 });
depositRefundSchema.index({ property: 1 });
depositRefundSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to calculate refund amount
depositRefundSchema.pre('save', function(next) {
  if (this.isModified('deductions') || this.isModified('depositAmount')) {
    const totalDeductions = this.deductions.reduce((sum, d) => sum + d.amount, 0);
    this.refundAmount = Math.max(0, this.depositAmount - totalDeductions);
  }
  next();
});

// Methods
depositRefundSchema.methods.updateStatus = async function(status, note, updatedBy) {
  this.status = status;
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note,
    updatedBy
  });
  return this.save();
};

depositRefundSchema.methods.completeStage = async function(stage, completedBy) {
  const stageIndex = this.stages.findIndex(s => s.stage === stage);
  
  if (stageIndex !== -1) {
    this.stages[stageIndex].completed = true;
    this.stages[stageIndex].timestamp = new Date();
    this.stages[stageIndex].completedBy = completedBy;
  } else {
    this.stages.push({
      stage,
      completed: true,
      timestamp: new Date(),
      completedBy
    });
  }
  
  return this.save();
};

depositRefundSchema.methods.addDeduction = async function(description, amount, category, evidence) {
  this.deductions.push({
    description,
    amount,
    category,
    evidence
  });
  return this.save();
};

depositRefundSchema.methods.approve = async function(approvedBy) {
  this.status = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  
  await this.completeStage('approved', approvedBy);
  
  this.statusHistory.push({
    status: 'approved',
    timestamp: new Date(),
    note: `Refund approved: KES ${this.refundAmount}`,
    updatedBy: approvedBy
  });
  
  return this.save();
};

depositRefundSchema.methods.reject = async function(reason, rejectedBy) {
  this.status = 'rejected';
  this.rejectionReason = reason;
  this.statusHistory.push({
    status: 'rejected',
    timestamp: new Date(),
    note: reason,
    updatedBy: rejectedBy
  });
  return this.save();
};

depositRefundSchema.methods.markAsPaid = async function(paymentDetails, paidBy) {
  this.status = 'paid';
  this.paymentDetails = paymentDetails;
  this.paidAt = new Date();
  this.processedBy = paidBy;
  this.processedAt = new Date();
  
  await this.completeStage('paid', paidBy);
  
  this.statusHistory.push({
    status: 'paid',
    timestamp: new Date(),
    note: `Refund paid: KES ${this.refundAmount}`,
    updatedBy: paidBy
  });
  
  return this.save();
};

// Static methods
depositRefundSchema.statics.getPendingRefunds = async function() {
  return this.find({
    status: { $in: ['submitted', 'inspection', 'approved', 'processing'] }
  })
    .populate('tenant', 'firstName lastName email phone')
    .populate('property', 'address unitNumber')
    .sort('createdAt');
};

module.exports = mongoose.model('DepositRefund', depositRefundSchema);
