const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const documentSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['lease', 'inspection', 'insurance', 'utilities', 'personal', 'other'],
    default: 'other'
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedByRole: {
    type: String,
    enum: ['tenant', 'landlord', 'manager', 'admin'],
    required: true
  },
  // Related entities
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property'
  },
  lease: {
    type: Schema.Types.ObjectId,
    ref: 'Lease'
  },
  // Sharing and permissions
  sharedWith: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
  description: String,
  tags: [String],
  expiryDate: Date,
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date
}, {
  timestamps: true
});

// Indexes
documentSchema.index({ uploadedBy: 1, createdAt: -1 });
documentSchema.index({ tenant: 1, category: 1 });
documentSchema.index({ landlord: 1, category: 1 });
documentSchema.index({ property: 1 });
documentSchema.index({ lease: 1 });
documentSchema.index({ category: 1, createdAt: -1 });
documentSchema.index({ tags: 1 });

// Methods
documentSchema.methods.shareWith = async function(userId, permissions = 'view') {
  const existingShare = this.sharedWith.find(s => s.user.toString() === userId.toString());
  
  if (existingShare) {
    existingShare.permissions = permissions;
  } else {
    this.sharedWith.push({
      user: userId,
      permissions,
      sharedAt: new Date()
    });
  }
  
  return this.save();
};

documentSchema.methods.archive = async function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Static methods
documentSchema.statics.getByCategory = async function(category, userId) {
  return this.find({
    category,
    $or: [
      { uploadedBy: userId },
      { tenant: userId },
      { landlord: userId },
      { 'sharedWith.user': userId }
    ],
    isArchived: false
  }).sort('-createdAt');
};

documentSchema.statics.getExpiringSoon = async function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    expiryDate: {
      $gte: new Date(),
      $lte: futureDate
    },
    isArchived: false
  }).populate('uploadedBy tenant landlord property');
};

module.exports = mongoose.model('Document', documentSchema);
