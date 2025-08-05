const mongoose = require('mongoose');

const LeaseSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Enhanced lease dates
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Kenyan legal terms (enhanced)
  terms: {
    durationMonths: {
      type: Number,
      min: 6,
      max: 24, // Standard Kenyan leases
      required: true
    },
    rentAmount: {
      type: Number,
      required: true,
      min: 0
    },
    depositAmount: {
      type: Number,
      required: true,
      min: 0
    },
    terminationNotice: {
      type: Number,
      default: 2, // Months (for landlords)
      validate: {
        validator: function(v) {
          return this.landlord ? v >= 2 : v >= 1; // 2mo landlord, 1mo tenant
        }
      }
    },
    // Additional terms
    rentDueDate: {
      type: Number, // Day of month (1-31)
      default: 1,
      min: 1,
      max: 31
    },
    lateFeePercentage: {
      type: Number,
      default: 5, // 5% late fee
      min: 0,
      max: 20
    },
    currency: {
      type: String,
      default: 'KES'
    }
  },

  // Lease status
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'expired', 'terminated', 'cancelled'],
    default: 'draft'
  },

  // Digital signing
  signatures: {
    landlord: {
      signedAt: Date,
      ipAddress: String, // For legal tracing
      signature: String, // Base64 encoded signature
      fullName: String
    },
    tenant: {
      signedAt: Date,
      ipAddress: String,
      signature: String, // Base64 encoded signature
      fullName: String
    }
  },

  // Lease documents
  documents: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['lease_agreement', 'addendum', 'inventory', 'other'],
      default: 'lease_agreement'
    },
    uploadDate: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // PDF snapshot
  documentUrl: String, // S3/Cloudinary link for main lease document

  // Utilities and additional costs
  utilities: {
    includedInRent: [String], // ['water', 'electricity', 'internet', etc.]
    tenantResponsible: [String],
    deposits: [{
      utility: String,
      amount: Number
    }]
  },

  // Lease conditions
  conditions: {
    petsAllowed: {
      type: Boolean,
      default: false
    },
    smokingAllowed: {
      type: Boolean,
      default: false
    },
    sublettingAllowed: {
      type: Boolean,
      default: false
    },
    maximumOccupants: {
      type: Number,
      default: 2
    }
  },

  // Payment tracking
  payments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],

  // Maintenance requests related to this lease
  maintenanceRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MaintenanceRequest'
  }],

  // Renewal information
  renewal: {
    isEligible: {
      type: Boolean,
      default: false
    },
    newTerms: {
      rentAmount: Number,
      durationMonths: Number,
      startDate: Date
    },
    requestedAt: Date,
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Termination information
  termination: {
    initiatedBy: {
      type: String,
      enum: ['landlord', 'tenant']
    },
    reason: String,
    noticeDate: Date,
    effectiveDate: Date,
    penaltyAmount: {
      type: Number,
      default: 0
    }
  },

  // Legal compliance (Kenya specific)
  compliance: {
    landRegistryNumber: String,
    councilApprovalNumber: String,
    fireCertificate: {
      number: String,
      expiryDate: Date
    },
    occupancyCertificate: {
      number: String,
      expiryDate: Date
    }
  },

  // Audit trail
  auditLog: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }]
}, { 
  timestamps: true 
});

// Indexes for better performance
LeaseSchema.index({ property: 1, status: 1 });
LeaseSchema.index({ tenant: 1, status: 1 });
LeaseSchema.index({ landlord: 1, status: 1 });
LeaseSchema.index({ startDate: 1, endDate: 1 });
LeaseSchema.index({ 'terms.rentDueDate': 1 });

// Virtual for lease duration calculation
LeaseSchema.virtual('actualDurationMonths').get(function() {
  if (this.startDate && this.endDate) {
    const diffTime = Math.abs(this.endDate - this.startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.round(diffDays / 30.44); // Average days per month
  }
  return null;
});

// Virtual for checking if lease is currently active
LeaseSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         this.startDate <= now && 
         this.endDate >= now;
});

// Virtual for days until expiry
LeaseSchema.virtual('daysUntilExpiry').get(function() {
  if (this.endDate) {
    const now = new Date();
    const diffTime = this.endDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return null;
});

// Pre-save middleware to calculate end date if not provided
LeaseSchema.pre('save', function(next) {
  if (this.startDate && this.terms.durationMonths && !this.endDate) {
    this.endDate = new Date(this.startDate);
    this.endDate.setMonth(this.endDate.getMonth() + this.terms.durationMonths);
  }
  
  // Auto-set landlord from property if not provided
  if (this.property && !this.landlord && this.isNew) {
    mongoose.model('Property').findById(this.property).populate('owner')
      .then(property => {
        if (property && property.owner) {
          this.landlord = property.owner._id;
        }
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

// Instance method to check if lease can be renewed
LeaseSchema.methods.canRenew = function() {
  const daysUntilExpiry = this.daysUntilExpiry;
  return this.status === 'active' && 
         daysUntilExpiry !== null && 
         daysUntilExpiry <= 60 && // Can renew 60 days before expiry
         daysUntilExpiry > 0;
};

// Instance method to calculate total rent for lease period
LeaseSchema.methods.getTotalRent = function() {
  return this.terms.rentAmount * this.terms.durationMonths;
};

// Instance method to add audit log entry
LeaseSchema.methods.addAuditLog = function(action, performedBy, details = {}) {
  this.auditLog.push({
    action,
    performedBy,
    details
  });
  return this.save();
};

// Static method to find expiring leases
LeaseSchema.statics.findExpiringLeases = function(daysAhead = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
  
  return this.find({
    status: 'active',
    endDate: { $lte: cutoffDate, $gte: new Date() }
  }).populate('property tenant landlord');
};

// Static method to find overdue rents
LeaseSchema.statics.findOverdueRents = function() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  return this.find({
    status: 'active',
    $expr: {
      $lt: [
        { $dayOfMonth: today },
        { $add: ['$terms.rentDueDate', 5] } 
      ]
    }
  }).populate('property tenant landlord');
};

module.exports = mongoose.model('Lease', LeaseSchema);