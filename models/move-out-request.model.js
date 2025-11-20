const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const moveOutRequestSchema = new Schema({
  referenceNumber: {
    type: String,
    required: true,
    unique: true
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
  moveOutDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  forwardingAddress: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inspection_scheduled', 'inspection_completed', 'completed', 'cancelled'],
    default: 'pending'
  },
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
  // Inspection details
  inspectionScheduled: {
    date: Date,
    time: String,
    inspector: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  inspectionReport: {
    completedAt: Date,
    condition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor']
    },
    damages: [{
      description: String,
      estimatedCost: Number,
      photos: [String]
    }],
    notes: String
  },
  // Stakeholder notifications
  stakeholderNotified: {
    type: Boolean,
    default: false
  },
  notifiedAt: Date,
  // Approval details
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  // Cancellation
  cancelledBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

// Indexes
moveOutRequestSchema.index({ tenant: 1, status: 1 });
moveOutRequestSchema.index({ property: 1, status: 1 });
moveOutRequestSchema.index({ referenceNumber: 1 });
moveOutRequestSchema.index({ moveOutDate: 1 });

// Pre-save hook to generate reference number
moveOutRequestSchema.pre('save', async function(next) {
  if (this.isNew && !this.referenceNumber) {
    this.referenceNumber = `MO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
  next();
});

// Methods
moveOutRequestSchema.methods.updateStatus = async function(status, note, updatedBy) {
  this.status = status;
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note,
    updatedBy
  });
  return this.save();
};

moveOutRequestSchema.methods.approve = async function(approvedBy) {
  this.status = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  this.statusHistory.push({
    status: 'approved',
    timestamp: new Date(),
    note: 'Move-out request approved',
    updatedBy: approvedBy
  });
  return this.save();
};

moveOutRequestSchema.methods.reject = async function(reason, rejectedBy) {
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

moveOutRequestSchema.methods.scheduleInspection = async function(date, time, inspector) {
  this.status = 'inspection_scheduled';
  this.inspectionScheduled = {
    date,
    time,
    inspector
  };
  this.statusHistory.push({
    status: 'inspection_scheduled',
    timestamp: new Date(),
    note: `Inspection scheduled for ${date} at ${time}`,
    updatedBy: inspector
  });
  return this.save();
};

moveOutRequestSchema.methods.cancel = async function(reason, cancelledBy) {
  this.status = 'cancelled';
  this.cancelledBy = cancelledBy;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: reason,
    updatedBy: cancelledBy
  });
  return this.save();
};

module.exports = mongoose.model('MoveOutRequest', moveOutRequestSchema);
