const mongoose = require('mongoose');

const propertyApprovalSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'revoked'],
    default: 'pending'
  },
  documents: [{
    type: {
      type: String,
      enum: [
        'ownership_proof',
        'tax_compliance',
        'business_permit',
        'insurance',
        'building_approval',
        'safety_certificate',
        'other'
      ],
      required: true
    },
    url: String,
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    expiryDate: Date,
    status: {
      type: String,
      enum: ['valid', 'expired', 'invalid'],
      default: 'valid'
    }
  }],
  complianceChecks: [{
    type: {
      type: String,
      enum: [
        'ownership_verification',
        'tax_compliance',
        'safety_standards',
        'insurance_coverage',
        'zoning_compliance',
        'building_codes'
      ],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'passed', 'failed'],
      default: 'pending'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    notes: String
  }],
  inspections: [{
    type: {
      type: String,
      enum: ['initial', 'routine', 'complaint', 'safety'],
      required: true
    },
    inspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    findings: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    images: [String],
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'failed'],
      default: 'scheduled'
    },
    nextInspectionDate: Date
  }],
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  revocationReason: String,
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  nextReviewDate: Date,
  isCompliant: {
    type: Boolean,
    default: false
  },
  complianceScore: {
    type: Number,
    min: 0,
    max: 100
  },
  warnings: [{
    type: String,
    date: Date,
    resolvedAt: Date
  }],
  notes: String
}, {
  timestamps: true
});

// Indexes
propertyApprovalSchema.index({ property: 1 });
propertyApprovalSchema.index({ status: 1 });
propertyApprovalSchema.index({ isCompliant: 1 });
propertyApprovalSchema.index({ 'documents.expiryDate': 1 });

module.exports = mongoose.model('PropertyApproval', propertyApprovalSchema);