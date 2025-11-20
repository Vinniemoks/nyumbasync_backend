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

    // Deal Type - Real Estate Transaction or Payment
    dealType: {
      type: String,
      enum: ['sale', 'purchase', 'lease', 'rental_payment', 'payment', 'other'],
      required: true,
      default: 'payment',
      index: true
    },

    // Related entities - The Core Relationships
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: function() {
        return ['sale', 'purchase', 'lease', 'rent', 'deposit', 'maintenance', 'payout'].includes(this.type);
      },
      index: true
    },

    // Contacts involved in this transaction
    contacts: [{
      contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
      role: {
        type: String,
        enum: ['buyer', 'seller', 'tenant', 'landlord', 'agent', 'lender', 'inspector', 'attorney', 'other']
      },
      isPrimary: { type: Boolean, default: false }
    }],

    // Legacy user field for backward compatibility
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
      enum: ['rent', 'deposit', 'maintenance', 'payout', 'utility_bill', 'refund', 'commission', 'earnest_money', 'other'],
      default: 'rent',
      index: true
    },
    description: {
      type: String,
      maxlength: 500
    },

    // Pipeline Stage - The Process Engine
    pipeline: {
      stage: {
        type: String,
        enum: [
          'lead', 'qualified', 'showing_scheduled', 'offer_made', 
          'under_contract', 'inspection', 'appraisal', 'financing',
          'final_walkthrough', 'closing', 'closed', 'lost'
        ],
        default: 'lead',
        index: true
      },
      stageHistory: [{
        stage: String,
        enteredAt: { type: Date, default: Date.now },
        exitedAt: Date,
        notes: String
      }],
      probability: {
        type: Number,
        min: 0,
        max: 100,
        default: 10
      },
      expectedCloseDate: Date,
      actualCloseDate: Date
    },

    // Milestones & Tasks - Key Dates with Automation
    milestones: [{
      name: {
        type: String,
        required: true
      },
      dueDate: Date,
      completedDate: Date,
      status: {
        type: String,
        enum: ['pending', 'completed', 'overdue', 'cancelled'],
        default: 'pending'
      },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: String,
      automationTriggered: { type: Boolean, default: false }
    }],

    // Tasks
    tasks: [{
      title: { type: String, required: true },
      description: String,
      dueDate: Date,
      completedDate: Date,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
      },
      status: {
        type: String,
        enum: ['todo', 'in_progress', 'completed', 'cancelled'],
        default: 'todo'
      },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      relatedMilestone: String
    }],

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

    // Document Vault - Centralized secure repository
    documents: [{
      name: { type: String, required: true },
      type: {
        type: String,
        enum: [
          'contract', 'disclosure', 'inspection_report', 'appraisal',
          'title_report', 'insurance', 'loan_docs', 'closing_statement',
          'receipt', 'invoice', 'other'
        ]
      },
      url: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      size: Number,
      mimeType: String,
      notes: String
    }],

    // Notes and Communication Log
    notes: [{
      content: { type: String, required: true, maxlength: 2000 },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now },
      isPrivate: { type: Boolean, default: false }
    }],

    // Financial Summary
    financials: {
      salePrice: Number,
      earnestMoney: Number,
      downPayment: Number,
      loanAmount: Number,
      closingCosts: Number,
      commission: {
        total: Number,
        buyerAgent: Number,
        sellerAgent: Number
      },
      netToSeller: Number
    },

    // Tenant Portal Integration (for Lease transactions)
    tenantPortal: {
      verificationCode: {
        type: String,
        unique: true,
        sparse: true,
        index: true
      },
      codeGeneratedAt: Date,
      codeExpiresAt: Date,
      invitationSentAt: Date,
      invitationEmail: String,
      tenantLinkedAt: Date,
      tenantContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }
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
transactionSchema.index({ dealType: 1 });
transactionSchema.index({ 'pipeline.stage': 1 });
transactionSchema.index({ 'pipeline.expectedCloseDate': 1 });
transactionSchema.index({ 'contacts.contact': 1 });
transactionSchema.index({ 'milestones.dueDate': 1 });
transactionSchema.index({ 'tasks.dueDate': 1 });
transactionSchema.index({ 'mpesa.receiptNumber': 1 }, { sparse: true });

// Virtuals
transactionSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toLocaleString()}`;
});

transactionSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

transactionSchema.virtual('daysInCurrentStage').get(function() {
  if (!this.pipeline || !this.pipeline.stageHistory.length) return 0;
  
  const currentStageEntry = this.pipeline.stageHistory
    .filter(sh => sh.stage === this.pipeline.stage && !sh.exitedAt)
    .sort((a, b) => b.enteredAt - a.enteredAt)[0];
  
  if (!currentStageEntry) return 0;
  
  return Math.floor((Date.now() - currentStageEntry.enteredAt) / (1000 * 60 * 60 * 24));
});

transactionSchema.virtual('primaryBuyer').get(function() {
  return this.contacts.find(c => c.role === 'buyer' && c.isPrimary);
});

transactionSchema.virtual('primarySeller').get(function() {
  return this.contacts.find(c => c.role === 'seller' && c.isPrimary);
});

transactionSchema.virtual('completionPercentage').get(function() {
  if (!this.tasks.length) return 0;
  const completed = this.tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / this.tasks.length) * 100);
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

transactionSchema.statics.findByContactId = function(contactId, options = {}) {
  const query = this.find({ 'contacts.contact': contactId });
  
  if (options.stage) {
    query.where('pipeline.stage', options.stage);
  }
  
  return query.sort({ createdAt: -1 })
    .populate('property', 'title address rent')
    .populate('contacts.contact', 'firstName lastName email phone');
};

transactionSchema.statics.findByStage = function(stage) {
  return this.find({ 'pipeline.stage': stage })
    .populate('property', 'title address')
    .populate('contacts.contact', 'firstName lastName email phone')
    .sort({ 'pipeline.expectedCloseDate': 1 });
};

transactionSchema.statics.getActivePipeline = function() {
  return this.find({
    'pipeline.stage': { 
      $nin: ['closed', 'lost'] 
    }
  })
  .populate('property', 'title address')
  .populate('contacts.contact', 'firstName lastName')
  .sort({ 'pipeline.probability': -1, 'pipeline.expectedCloseDate': 1 });
};

transactionSchema.statics.getOverdueTransactions = function() {
  const now = new Date();
  return this.find({
    'pipeline.stage': { $nin: ['closed', 'lost'] },
    $or: [
      { 'milestones.dueDate': { $lt: now }, 'milestones.status': 'pending' },
      { 'tasks.dueDate': { $lt: now }, 'tasks.status': { $in: ['todo', 'in_progress'] } }
    ]
  })
  .populate('property', 'title address')
  .populate('contacts.contact', 'firstName lastName');
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

transactionSchema.statics.getPipelineStats = async function() {
  return this.aggregate([
    {
      $match: {
        'pipeline.stage': { $nin: ['closed', 'lost'] }
      }
    },
    {
      $group: {
        _id: '$pipeline.stage',
        count: { $sum: 1 },
        totalValue: { $sum: '$amount' },
        avgProbability: { $avg: '$pipeline.probability' }
      }
    },
    { $sort: { avgProbability: -1 } }
  ]);
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

// Pipeline Management
transactionSchema.methods.moveToStage = function(newStage, notes = '') {
  if (this.pipeline.stage === newStage) return this;
  
  // Record stage history
  const currentStageHistory = this.pipeline.stageHistory.find(
    sh => sh.stage === this.pipeline.stage && !sh.exitedAt
  );
  
  if (currentStageHistory) {
    currentStageHistory.exitedAt = new Date();
  }
  
  this.pipeline.stageHistory.push({
    stage: newStage,
    enteredAt: new Date(),
    notes
  });
  
  this.pipeline.stage = newStage;
  
  // Update probability based on stage
  const stageProbabilities = {
    'lead': 10,
    'qualified': 25,
    'showing_scheduled': 40,
    'offer_made': 60,
    'under_contract': 75,
    'inspection': 80,
    'appraisal': 85,
    'financing': 90,
    'final_walkthrough': 95,
    'closing': 98,
    'closed': 100,
    'lost': 0
  };
  
  this.pipeline.probability = stageProbabilities[newStage] || this.pipeline.probability;
  
  if (newStage === 'closed') {
    this.pipeline.actualCloseDate = new Date();
  }
  
  return this.save();
};

transactionSchema.methods.addMilestone = function(name, dueDate, assignedTo = null) {
  this.milestones.push({
    name,
    dueDate,
    assignedTo,
    status: 'pending'
  });
  return this.save();
};

transactionSchema.methods.completeMilestone = function(milestoneName) {
  const milestone = this.milestones.find(m => m.name === milestoneName);
  if (milestone) {
    milestone.status = 'completed';
    milestone.completedDate = new Date();
  }
  return this.save();
};

transactionSchema.methods.addTask = function(taskData) {
  this.tasks.push(taskData);
  return this.save();
};

transactionSchema.methods.completeTask = function(taskId) {
  const task = this.tasks.id(taskId);
  if (task) {
    task.status = 'completed';
    task.completedDate = new Date();
  }
  return this.save();
};

transactionSchema.methods.addDocument = function(documentData) {
  this.documents.push(documentData);
  return this.save();
};

transactionSchema.methods.addNote = function(content, createdBy, isPrivate = false) {
  this.notes.push({
    content,
    createdBy,
    isPrivate,
    createdAt: new Date()
  });
  return this.save();
};

transactionSchema.methods.addContact = function(contactId, role, isPrimary = false) {
  const existing = this.contacts.find(
    c => c.contact.toString() === contactId.toString()
  );
  
  if (existing) {
    existing.role = role;
    existing.isPrimary = isPrimary;
  } else {
    this.contacts.push({
      contact: contactId,
      role,
      isPrimary
    });
  }
  
  return this.save();
};

transactionSchema.methods.getOverdueTasks = function() {
  const now = new Date();
  return this.tasks.filter(
    task => task.status !== 'completed' && 
            task.status !== 'cancelled' && 
            task.dueDate && 
            task.dueDate < now
  );
};

transactionSchema.methods.getOverdueMilestones = function() {
  const now = new Date();
  return this.milestones.filter(
    milestone => milestone.status === 'pending' && 
                 milestone.dueDate && 
                 milestone.dueDate < now
  );
};

// Tenant Portal Methods
transactionSchema.methods.generateVerificationCode = function() {
  // Generate a unique 8-character alphanumeric code
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  
  this.tenantPortal.verificationCode = code;
  this.tenantPortal.codeGeneratedAt = new Date();
  // Code expires in 30 days
  this.tenantPortal.codeExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  return this.save();
};

transactionSchema.methods.sendTenantInvitation = function(email) {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  
  this.tenantPortal.invitationSentAt = new Date();
  this.tenantPortal.invitationEmail = email;
  
  return this.save();
};

transactionSchema.methods.linkTenantContact = function(contactId) {
  if (!this.tenantPortal) {
    this.tenantPortal = {};
  }
  
  this.tenantPortal.tenantLinkedAt = new Date();
  this.tenantPortal.tenantContact = contactId;
  
  return this.save();
};

transactionSchema.statics.findByVerificationCode = function(code) {
  return this.findOne({
    'tenantPortal.verificationCode': code.toUpperCase(),
    'tenantPortal.codeExpiresAt': { $gt: new Date() },
    dealType: 'lease',
    'pipeline.stage': { $in: ['under_contract', 'closed'] }
  }).populate('property', 'title address rent')
    .populate('contacts.contact', 'firstName lastName email phone');
};

module.exports = mongoose.model('Transaction', transactionSchema);