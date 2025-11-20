const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Contact Model - The Relationship Hub
 * Every person in your real estate business is a Contact with roles
 * Tracks all interactions, preferences, and relationships
 */
const contactSchema = new Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email address'
    },
    index: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    index: true
  },
  alternatePhone: String,

  // Role Management - A contact can have multiple roles
  roles: [{
    type: String,
    enum: [
      'buyer', 'seller', 'lead', 'tenant', 'landlord',
      'lender', 'inspector', 'contractor', 'agent',
      'attorney', 'title_company', 'appraiser', 'other'
    ]
  }],
  primaryRole: {
    type: String,
    enum: [
      'buyer', 'seller', 'lead', 'tenant', 'landlord',
      'lender', 'inspector', 'contractor', 'agent',
      'attorney', 'title_company', 'appraiser', 'other'
    ],
    required: true,
    default: 'lead',
    index: true
  },

  // Lead/Buyer Specific Fields
  buyerProfile: {
    status: {
      type: String,
      enum: ['cold', 'warm', 'hot', 'active', 'closed', 'lost'],
      default: 'cold'
    },
    preApproved: { type: Boolean, default: false },
    preApprovalAmount: Number,
    lender: { type: Schema.Types.ObjectId, ref: 'Contact' },
    
    // Search Criteria
    criteria: {
      propertyTypes: [String],
      minBedrooms: Number,
      maxBedrooms: Number,
      minBathrooms: Number,
      minPrice: Number,
      maxPrice: Number,
      locations: [String], // Areas/neighborhoods
      mustHaveAmenities: [String],
      moveInDate: Date,
      notes: String
    },
    
    // Saved searches
    savedSearches: [{
      name: String,
      filters: Schema.Types.Mixed,
      alertFrequency: {
        type: String,
        enum: ['instant', 'daily', 'weekly', 'never'],
        default: 'daily'
      },
      createdAt: { type: Date, default: Date.now }
    }]
  },

  // Seller Specific Fields
  sellerProfile: {
    propertyAddress: String,
    askingPrice: Number,
    motivation: {
      type: String,
      enum: ['high', 'medium', 'low']
    },
    timeframe: String,
    currentMortgageBalance: Number,
    notes: String
  },

  // Service Provider Fields (Inspector, Contractor, etc.)
  serviceProvider: {
    company: String,
    specialty: String,
    licenseNumber: String,
    rating: { type: Number, min: 0, max: 5 },
    hourlyRate: Number,
    notes: String
  },

  // Interaction History
  interactions: [{
    type: {
      type: String,
      enum: ['call', 'email', 'text', 'meeting', 'showing', 'note'],
      required: true
    },
    date: { type: Date, default: Date.now },
    subject: String,
    notes: { type: String, maxlength: 2000 },
    outcome: String,
    nextAction: String,
    nextActionDate: Date,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }],

  // Tags for organization and automation
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // Source tracking
  source: {
    type: String,
    enum: [
      'referral', 'website', 'social_media', 'open_house',
      'cold_call', 'advertisement', 'walk_in', 'other'
    ]
  },
  referredBy: { type: Schema.Types.ObjectId, ref: 'Contact' },

  // Relationships
  relatedProperties: [{
    property: { type: Schema.Types.ObjectId, ref: 'Property' },
    relationship: {
      type: String,
      enum: ['interested', 'viewed', 'offered', 'owns', 'rents', 'sold']
    },
    date: { type: Date, default: Date.now },
    notes: String
  }],

  relatedTransactions: [{
    type: Schema.Types.ObjectId,
    ref: 'Transaction'
  }],

  // Communication Preferences
  preferences: {
    preferredContact: {
      type: String,
      enum: ['email', 'phone', 'text', 'any'],
      default: 'any'
    },
    bestTimeToCall: String,
    doNotContact: { type: Boolean, default: false },
    emailOptIn: { type: Boolean, default: true },
    smsOptIn: { type: Boolean, default: true }
  },

  // Tenant Journey Pipeline
  tenantJourney: {
    // Current stage in the tenant journey
    currentStage: {
      type: String,
      enum: [
        'prospect',           // Stage 1: Initial inquiry
        'applicant',          // Stage 2: Application submitted
        'approved',           // Stage 3: Application approved
        'under_review',       // Stage 3: Application under review
        'rejected',           // Stage 3: Application rejected
        'leased',             // Stage 4: Active tenant
        'move_out_notice',    // Stage 6: Notice given
        'former_tenant'       // Stage 7: Lease closed
      ],
      default: 'prospect',
      index: true
    },
    
    // Stage history tracking
    stageHistory: [{
      stage: String,
      enteredAt: { type: Date, default: Date.now },
      exitedAt: Date,
      notes: String,
      changedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    }],
    
    // Stage 1: Prospect data
    prospectInfo: {
      inquirySource: {
        type: String,
        enum: ['zillow', 'facebook', 'website', 'referral', 'walk_in', 'phone', 'email', 'other']
      },
      desiredMoveInDate: Date,
      numberOfOccupants: Number,
      inquiryDate: { type: Date, default: Date.now },
      interestedProperties: [{ type: Schema.Types.ObjectId, ref: 'Property' }],
      budgetRange: {
        min: Number,
        max: Number
      }
    },
    
    // Stage 2: Application data
    applicationInfo: {
      submittedAt: Date,
      applicationFormUrl: String,
      backgroundCheckStatus: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        default: 'pending'
      },
      backgroundCheckProvider: String,
      backgroundCheckId: String,
      creditScore: Number,
      incomeVerified: { type: Boolean, default: false },
      referencesChecked: { type: Boolean, default: false },
      employmentInfo: {
        employer: String,
        position: String,
        monthlyIncome: Number,
        yearsEmployed: Number
      },
      rentalHistory: [{
        address: String,
        landlordName: String,
        landlordPhone: String,
        moveInDate: Date,
        moveOutDate: Date,
        rentAmount: Number,
        reasonForLeaving: String
      }]
    },
    
    // Stage 3: Approval/Review data
    reviewInfo: {
      reviewedAt: Date,
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'conditional']
      },
      approvalNotes: String,
      rejectionReason: String,
      adverseActionSent: { type: Boolean, default: false },
      adverseActionSentAt: Date,
      conditions: [String],
      leaseGeneratedAt: Date,
      leaseSignedAt: Date,
      securityDepositAmount: Number,
      securityDepositPaid: { type: Boolean, default: false },
      securityDepositPaidAt: Date
    },
    
    // Stage 4: Active Tenant data
    leaseInfo: {
      leaseStartDate: Date,
      leaseEndDate: Date,
      monthlyRent: Number,
      rentDueDay: { type: Number, min: 1, max: 28, default: 1 },
      moveInDate: Date,
      moveInInspectionCompleted: { type: Boolean, default: false },
      moveInInspectionDate: Date,
      moveInInspectionReport: String,
      welcomePacketSent: { type: Boolean, default: false },
      welcomePacketSentAt: Date,
      autoPayEnabled: { type: Boolean, default: false },
      rentPaymentHistory: [{
        dueDate: Date,
        paidDate: Date,
        amount: Number,
        status: {
          type: String,
          enum: ['pending', 'paid', 'late', 'partial', 'missed']
        },
        transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' }
      }]
    },
    
    // Stage 5: Maintenance & Communication (ongoing)
    maintenanceInfo: {
      totalRequests: { type: Number, default: 0 },
      openRequests: { type: Number, default: 0 },
      lastRequestDate: Date,
      averageResponseTime: Number, // in hours
      satisfactionRating: { type: Number, min: 0, max: 5 }
    },
    
    // Stage 6: Move-Out data
    moveOutInfo: {
      noticeGivenDate: Date,
      noticeReceivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      intendedMoveOutDate: Date,
      actualMoveOutDate: Date,
      moveOutReason: {
        type: String,
        enum: ['lease_end', 'relocation', 'purchase', 'eviction', 'other']
      },
      moveOutReasonDetails: String,
      moveOutInspectionScheduled: { type: Boolean, default: false },
      moveOutInspectionDate: Date,
      moveOutInspectionCompleted: { type: Boolean, default: false },
      moveOutInspectionReport: String,
      damagesIdentified: [{
        description: String,
        estimatedCost: Number,
        photos: [String]
      }],
      securityDepositRefund: {
        totalDeposit: Number,
        deductions: [{
          description: String,
          amount: Number
        }],
        refundAmount: Number,
        refundDate: Date,
        refundMethod: String
      },
      forwardingAddress: {
        street: String,
        city: String,
        state: String,
        postalCode: String
      }
    },
    
    // Stage 7: Former Tenant data
    closureInfo: {
      closedAt: Date,
      closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      finalAccountingCompleted: { type: Boolean, default: false },
      allObligationsMet: { type: Boolean, default: false },
      wouldRentAgain: { type: Boolean, default: true },
      tenancyRating: { type: Number, min: 0, max: 5 },
      internalNotes: String
    }
  },

  // Tenant Portal Specific Fields
  tenantPortal: {
    // Phase 1: Initial Registration
    hasPortalAccess: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpiry: Date,
    phoneVerified: { type: Boolean, default: false },
    phoneVerificationCode: String,
    phoneVerificationExpiry: Date,
    termsAcceptedAt: Date,
    privacyPolicyAcceptedAt: Date,
    
    // Phase 2: Lease Linkage
    linkedLeases: [{
      transaction: { type: Schema.Types.ObjectId, ref: 'Transaction' },
      property: { type: Schema.Types.ObjectId, ref: 'Property' },
      verificationCode: String,
      linkedAt: Date,
      status: {
        type: String,
        enum: ['pending', 'active', 'expired', 'terminated'],
        default: 'pending'
      }
    }],
    
    // Phase 3: Complete Profile
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
      address: {
        street: String,
        city: String,
        postalCode: String
      }
    },
    
    occupants: [{
      fullName: { type: String, required: true },
      dateOfBirth: Date,
      relationship: String
    }],
    
    vehicles: [{
      make: String,
      model: String,
      color: String,
      licensePlate: { type: String, uppercase: true },
      parkingPassNumber: String
    }],
    
    preferredCommunicationMethod: {
      type: String,
      enum: ['portal', 'email', 'sms', 'phone'],
      default: 'portal'
    },
    
    profileCompletedAt: Date,
    lastLoginAt: Date
  },

  // Important Dates
  birthday: Date,
  anniversary: Date,

  // Address
  address: {
    street: String,
    city: String,
    county: String,
    postalCode: String
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true
  },

  // Assignment
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Metadata
  lastContactDate: Date,
  nextFollowUpDate: { type: Date, index: true },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  notes: { type: String, maxlength: 5000 },
  customFields: Schema.Types.Mixed

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
contactSchema.index({ firstName: 1, lastName: 1 });
contactSchema.index({ email: 1 }, { sparse: true });
contactSchema.index({ phone: 1 });
contactSchema.index({ primaryRole: 1, status: 1 });
contactSchema.index({ tags: 1 });
contactSchema.index({ 'buyerProfile.status': 1 });
contactSchema.index({ assignedTo: 1, status: 1 });
contactSchema.index({ nextFollowUpDate: 1 });
contactSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

// Virtuals
contactSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

contactSchema.virtual('displayName').get(function() {
  return this.fullName;
});

contactSchema.virtual('daysSinceLastContact').get(function() {
  if (!this.lastContactDate) return null;
  return Math.floor((Date.now() - this.lastContactDate) / (1000 * 60 * 60 * 24));
});

contactSchema.virtual('isOverdue').get(function() {
  return this.nextFollowUpDate && this.nextFollowUpDate < new Date();
});

// Instance Methods
contactSchema.methods.addInteraction = function(interactionData) {
  this.interactions.push(interactionData);
  this.lastContactDate = new Date();
  return this.save();
};

contactSchema.methods.addTag = function(tag) {
  const normalizedTag = tag.toLowerCase().trim();
  if (!this.tags.includes(normalizedTag)) {
    this.tags.push(normalizedTag);
    return this.save();
  }
  return this;
};

contactSchema.methods.removeTag = function(tag) {
  const normalizedTag = tag.toLowerCase().trim();
  this.tags = this.tags.filter(t => t !== normalizedTag);
  return this.save();
};

contactSchema.methods.linkProperty = function(propertyId, relationship, notes = '') {
  const existing = this.relatedProperties.find(
    rp => rp.property.toString() === propertyId.toString()
  );
  
  if (existing) {
    existing.relationship = relationship;
    existing.date = new Date();
    existing.notes = notes;
  } else {
    this.relatedProperties.push({
      property: propertyId,
      relationship,
      notes,
      date: new Date()
    });
  }
  
  return this.save();
};

contactSchema.methods.updateBuyerStatus = function(status) {
  if (!this.buyerProfile) {
    this.buyerProfile = {};
  }
  this.buyerProfile.status = status;
  return this.save();
};

contactSchema.methods.setNextFollowUp = function(date, notes = '') {
  this.nextFollowUpDate = date;
  if (notes) {
    this.addInteraction({
      type: 'note',
      notes: `Follow-up scheduled: ${notes}`,
      nextActionDate: date
    });
  }
  return this.save();
};

// Tenant Portal Methods
contactSchema.methods.enablePortalAccess = function(email, phone) {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  this.tenantPortal.hasPortalAccess = true;
  this.email = email;
  this.phone = phone;
  
  // Add tenant-portal tag
  if (!this.tags.includes('tenant-portal')) {
    this.tags.push('tenant-portal');
  }
  
  return this.save();
};

contactSchema.methods.verifyEmail = function() {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  this.tenantPortal.emailVerified = true;
  this.tenantPortal.emailVerificationToken = undefined;
  this.tenantPortal.emailVerificationExpiry = undefined;
  return this.save();
};

contactSchema.methods.verifyPhone = function() {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  this.tenantPortal.phoneVerified = true;
  this.tenantPortal.phoneVerificationCode = undefined;
  this.tenantPortal.phoneVerificationExpiry = undefined;
  return this.save();
};

contactSchema.methods.linkLease = function(transactionId, propertyId, verificationCode) {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  if (!this.tenantPortal.linkedLeases) {
    this.tenantPortal.linkedLeases = [];
  }
  
  this.tenantPortal.linkedLeases.push({
    transaction: transactionId,
    property: propertyId,
    verificationCode,
    linkedAt: new Date(),
    status: 'active'
  });
  
  // Ensure tenant role is added
  if (!this.roles.includes('tenant')) {
    this.roles.push('tenant');
  }
  if (this.primaryRole === 'lead') {
    this.primaryRole = 'tenant';
  }
  
  return this.save();
};

contactSchema.methods.completePortalProfile = function(profileData) {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  
  if (profileData.emergencyContact) {
    this.tenantPortal.emergencyContact = profileData.emergencyContact;
  }
  
  if (profileData.occupants) {
    this.tenantPortal.occupants = profileData.occupants;
  }
  
  if (profileData.vehicles) {
    this.tenantPortal.vehicles = profileData.vehicles;
  }
  
  if (profileData.preferredCommunicationMethod) {
    this.tenantPortal.preferredCommunicationMethod = profileData.preferredCommunicationMethod;
  }
  
  this.tenantPortal.profileCompletedAt = new Date();
  
  return this.save();
};

contactSchema.methods.updateLastLogin = function() {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  this.tenantPortal.lastLoginAt = new Date();
  return this.save();
};

// Tenant Journey Methods
contactSchema.methods.moveToJourneyStage = function(newStage, notes = '', changedBy = null) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  const oldStage = this.tenantJourney.currentStage;
  
  // Record stage history
  if (oldStage) {
    const currentStageHistory = this.tenantJourney.stageHistory?.find(
      sh => sh.stage === oldStage && !sh.exitedAt
    );
    if (currentStageHistory) {
      currentStageHistory.exitedAt = new Date();
    }
  }
  
  if (!this.tenantJourney.stageHistory) {
    this.tenantJourney.stageHistory = [];
  }
  
  this.tenantJourney.stageHistory.push({
    stage: newStage,
    enteredAt: new Date(),
    notes,
    changedBy
  });
  
  this.tenantJourney.currentStage = newStage;
  
  return this.save();
};

contactSchema.methods.submitApplication = function(applicationData) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.applicationInfo = {
    ...applicationData,
    submittedAt: new Date(),
    backgroundCheckStatus: 'pending'
  };
  
  return this.moveToJourneyStage('applicant', 'Application submitted');
};

contactSchema.methods.approveApplication = function(approvalData, approvedBy) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.reviewInfo = {
    ...approvalData,
    reviewedAt: new Date(),
    reviewedBy: approvedBy,
    approvalStatus: 'approved'
  };
  
  return this.moveToJourneyStage('approved', 'Application approved', approvedBy);
};

contactSchema.methods.rejectApplication = function(reason, rejectedBy) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.reviewInfo = {
    reviewedAt: new Date(),
    reviewedBy: rejectedBy,
    approvalStatus: 'rejected',
    rejectionReason: reason
  };
  
  return this.moveToJourneyStage('rejected', `Application rejected: ${reason}`, rejectedBy);
};

contactSchema.methods.activateLease = function(leaseData) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.leaseInfo = {
    ...leaseData,
    moveInDate: leaseData.moveInDate || new Date(),
    rentPaymentHistory: []
  };
  
  // Ensure tenant role
  if (!this.roles.includes('tenant')) {
    this.roles.push('tenant');
  }
  if (this.primaryRole === 'lead' || this.primaryRole === 'applicant') {
    this.primaryRole = 'tenant';
  }
  
  return this.moveToJourneyStage('leased', 'Lease activated');
};

contactSchema.methods.recordRentPayment = function(paymentData) {
  if (!this.tenantJourney?.leaseInfo) {
    throw new Error('No active lease found');
  }
  
  if (!this.tenantJourney.leaseInfo.rentPaymentHistory) {
    this.tenantJourney.leaseInfo.rentPaymentHistory = [];
  }
  
  this.tenantJourney.leaseInfo.rentPaymentHistory.push(paymentData);
  
  return this.save();
};

contactSchema.methods.submitMoveOutNotice = function(moveOutData) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.moveOutInfo = {
    ...moveOutData,
    noticeGivenDate: new Date()
  };
  
  return this.moveToJourneyStage('move_out_notice', 'Move-out notice received');
};

contactSchema.methods.closeTenancy = function(closureData, closedBy) {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  
  this.tenantJourney.closureInfo = {
    ...closureData,
    closedAt: new Date(),
    closedBy
  };
  
  return this.moveToJourneyStage('former_tenant', 'Tenancy closed', closedBy);
};

contactSchema.methods.recordMaintenanceRequest = function() {
  if (!this.tenantJourney) {
    this.tenantJourney = {};
  }
  if (!this.tenantJourney.maintenanceInfo) {
    this.tenantJourney.maintenanceInfo = {
      totalRequests: 0,
      openRequests: 0
    };
  }
  
  this.tenantJourney.maintenanceInfo.totalRequests += 1;
  this.tenantJourney.maintenanceInfo.openRequests += 1;
  this.tenantJourney.maintenanceInfo.lastRequestDate = new Date();
  
  return this.save();
};

contactSchema.methods.closeMaintenanceRequest = function(responseTimeHours) {
  if (!this.tenantJourney?.maintenanceInfo) {
    return this;
  }
  
  this.tenantJourney.maintenanceInfo.openRequests = Math.max(
    0,
    this.tenantJourney.maintenanceInfo.openRequests - 1
  );
  
  // Update average response time
  const currentAvg = this.tenantJourney.maintenanceInfo.averageResponseTime || 0;
  const totalRequests = this.tenantJourney.maintenanceInfo.totalRequests;
  this.tenantJourney.maintenanceInfo.averageResponseTime = 
    ((currentAvg * (totalRequests - 1)) + responseTimeHours) / totalRequests;
  
  return this.save();
};

// Static Methods
contactSchema.statics.findByRole = function(role, filters = {}) {
  const query = { primaryRole: role, status: 'active', ...filters };
  return this.find(query).sort({ lastContactDate: -1 });
};

contactSchema.statics.findHotLeads = function() {
  return this.find({
    primaryRole: { $in: ['buyer', 'lead'] },
    'buyerProfile.status': { $in: ['hot', 'active'] },
    status: 'active'
  }).sort({ 'buyerProfile.status': -1, lastContactDate: -1 });
};

contactSchema.statics.findOverdueFollowUps = function(assignedTo = null) {
  const query = {
    nextFollowUpDate: { $lt: new Date() },
    status: 'active'
  };
  
  if (assignedTo) {
    query.assignedTo = assignedTo;
  }
  
  return this.find(query).sort({ nextFollowUpDate: 1 });
};

contactSchema.statics.findByTag = function(tag) {
  return this.find({
    tags: tag.toLowerCase().trim(),
    status: 'active'
  });
};

contactSchema.statics.searchContacts = function(searchTerm) {
  return this.find({
    $or: [
      { firstName: new RegExp(searchTerm, 'i') },
      { lastName: new RegExp(searchTerm, 'i') },
      { email: new RegExp(searchTerm, 'i') },
      { phone: new RegExp(searchTerm, 'i') }
    ],
    status: 'active'
  }).limit(20);
};

contactSchema.statics.getContactStats = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$primaryRole',
        count: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Tenant Portal Static Methods
contactSchema.statics.findByEmail = function(email) {
  return this.findOne({
    email: email.toLowerCase().trim(),
    'tenantPortal.hasPortalAccess': true
  });
};

contactSchema.statics.findByVerificationToken = function(token) {
  return this.findOne({
    'tenantPortal.emailVerificationToken': token,
    'tenantPortal.emailVerificationExpiry': { $gt: new Date() }
  });
};

contactSchema.statics.findTenantPortalUsers = function(filters = {}) {
  const query = {
    'tenantPortal.hasPortalAccess': true,
    status: 'active'
  };
  
  if (filters.emailVerified !== undefined) {
    query['tenantPortal.emailVerified'] = filters.emailVerified;
  }
  
  if (filters.profileCompleted !== undefined) {
    if (filters.profileCompleted) {
      query['tenantPortal.profileCompletedAt'] = { $exists: true };
    } else {
      query['tenantPortal.profileCompletedAt'] = { $exists: false };
    }
  }
  
  return this.find(query);
};

// Tenant Journey Static Methods
contactSchema.statics.findByJourneyStage = function(stage) {
  return this.find({
    'tenantJourney.currentStage': stage,
    status: 'active'
  }).sort({ 'tenantJourney.stageHistory.enteredAt': -1 });
};

contactSchema.statics.findProspects = function() {
  return this.findByJourneyStage('prospect');
};

contactSchema.statics.findApplicants = function() {
  return this.findByJourneyStage('applicant');
};

contactSchema.statics.findActiveTenants = function() {
  return this.findByJourneyStage('leased')
    .populate('tenantJourney.leaseInfo.rentPaymentHistory.transactionId');
};

contactSchema.statics.findTenantsWithMoveOutNotice = function() {
  return this.findByJourneyStage('move_out_notice');
};

contactSchema.statics.findFormerTenants = function() {
  return this.findByJourneyStage('former_tenant');
};

contactSchema.statics.findLateRentPayments = function() {
  const today = new Date();
  return this.find({
    'tenantJourney.currentStage': 'leased',
    status: 'active'
  }).then(tenants => {
    return tenants.filter(tenant => {
      const rentDueDay = tenant.tenantJourney.leaseInfo?.rentDueDay || 1;
      const currentDay = today.getDate();
      
      // Check if rent is overdue (past due day)
      if (currentDay > rentDueDay) {
        const lastPayment = tenant.tenantJourney.leaseInfo?.rentPaymentHistory?.slice(-1)[0];
        if (!lastPayment || lastPayment.status !== 'paid') {
          return true;
        }
      }
      return false;
    });
  });
};

contactSchema.statics.findPendingApplications = function() {
  return this.find({
    'tenantJourney.currentStage': 'applicant',
    'tenantJourney.applicationInfo.backgroundCheckStatus': 'pending',
    status: 'active'
  });
};

contactSchema.statics.getTenantJourneyStats = async function() {
  return this.aggregate([
    {
      $match: {
        'tenantJourney.currentStage': { $exists: true }
      }
    },
    {
      $group: {
        _id: '$tenantJourney.currentStage',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Middleware
contactSchema.pre('save', function(next) {
  // Ensure primaryRole is in roles array
  if (this.primaryRole && !this.roles.includes(this.primaryRole)) {
    this.roles.push(this.primaryRole);
  }
  
  // Update lastContactDate if new interaction added
  if (this.isModified('interactions') && this.interactions.length > 0) {
    const latestInteraction = this.interactions[this.interactions.length - 1];
    if (!this.lastContactDate || latestInteraction.date > this.lastContactDate) {
      this.lastContactDate = latestInteraction.date;
    }
  }
  
  next();
});

module.exports = mongoose.model('Contact', contactSchema);
