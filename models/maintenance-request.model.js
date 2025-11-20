const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Maintenance Request Model
 * Tracks maintenance requests from tenants through resolution
 */
const maintenanceRequestSchema = new Schema({
  // Request identification
  requestNumber: {
    type: String,
    unique: true,
    index: true,
    default: () => `MR${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
  },
  
  // Related entities
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    index: true
  },
  
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  
  unit: String, // Specific unit/apartment number
  
  // Request details
  category: {
    type: String,
    enum: [
      'plumbing',
      'electrical',
      'hvac',
      'appliance',
      'structural',
      'pest_control',
      'locks_keys',
      'landscaping',
      'other'
    ],
    required: true,
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'emergency'],
    default: 'medium',
    index: true
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  
  location: {
    type: String,
    required: true // e.g., "Kitchen", "Master Bathroom", "Living Room"
  },
  
  // Media attachments
  photos: [{
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    caption: String
  }],
  
  videos: [{
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    caption: String
  }],
  
  // Status tracking
  status: {
    type: String,
    enum: [
      'submitted',      // Initial submission
      'acknowledged',   // Landlord has seen it
      'scheduled',      // Work scheduled
      'in_progress',    // Work in progress
      'completed',      // Work completed
      'closed',         // Tenant confirmed completion
      'cancelled'       // Request cancelled
    ],
    default: 'submitted',
    index: true
  },
  
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: String
  }],
  
  // Scheduling
  requestedDate: {
    type: Date,
    default: Date.now
  },
  
  acknowledgedAt: Date,
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  scheduledDate: Date,
  scheduledTimeSlot: String, // e.g., "9:00 AM - 12:00 PM"
  
  startedAt: Date,
  completedAt: Date,
  closedAt: Date,
  
  // Vendor/Contractor assignment
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'Contact' // Vendor/contractor contact
  },
  
  assignedAt: Date,
  
  // Work details
  workPerformed: String,
  
  partsUsed: [{
    name: String,
    quantity: Number,
    cost: Number
  }],
  
  laborHours: Number,
  laborRate: Number,
  
  // Costs
  estimatedCost: Number,
  actualCost: Number,
  
  billableTo: {
    type: String,
    enum: ['landlord', 'tenant', 'warranty', 'insurance'],
    default: 'landlord'
  },
  
  // Tenant access
  tenantPresenceRequired: {
    type: Boolean,
    default: false
  },
  
  accessInstructions: String,
  
  // Communication
  updates: [{
    message: String,
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date, default: Date.now },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    readAt: Date
  }],
  
  // Tenant feedback
  tenantRating: {
    type: Number,
    min: 1,
    max: 5
  },
  
  tenantFeedback: String,
  feedbackSubmittedAt: Date,
  
  // Internal notes (not visible to tenant)
  internalNotes: [{
    note: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Follow-up
  followUpRequired: { type: Boolean, default: false },
  followUpDate: Date,
  followUpCompleted: { type: Boolean, default: false },
  
  // Warranty/Insurance
  underWarranty: { type: Boolean, default: false },
  warrantyProvider: String,
  warrantyClaimNumber: String,
  
  insuranceClaim: { type: Boolean, default: false },
  insuranceClaimNumber: String,
  
  // Metadata
  source: {
    type: String,
    enum: ['portal', 'email', 'phone', 'text', 'in_person'],
    default: 'portal'
  },
  
  urgencyLevel: Number, // 1-10 scale
  
  tags: [String]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
maintenanceRequestSchema.index({ tenant: 1, status: 1 });
maintenanceRequestSchema.index({ property: 1, status: 1 });
maintenanceRequestSchema.index({ assignedTo: 1, status: 1 });
maintenanceRequestSchema.index({ priority: 1, status: 1 });
maintenanceRequestSchema.index({ requestedDate: -1 });
maintenanceRequestSchema.index({ scheduledDate: 1 });

// Virtuals
maintenanceRequestSchema.virtual('responseTime').get(function() {
  if (!this.acknowledgedAt) return null;
  return Math.floor((this.acknowledgedAt - this.requestedDate) / (1000 * 60 * 60)); // hours
});

maintenanceRequestSchema.virtual('resolutionTime').get(function() {
  if (!this.completedAt) return null;
  return Math.floor((this.completedAt - this.requestedDate) / (1000 * 60 * 60)); // hours
});

maintenanceRequestSchema.virtual('isOverdue').get(function() {
  if (this.status === 'completed' || this.status === 'closed') return false;
  
  const now = new Date();
  const hoursSinceRequest = (now - this.requestedDate) / (1000 * 60 * 60);
  
  // Emergency: 4 hours, High: 24 hours, Medium: 72 hours, Low: 168 hours
  const slaHours = {
    emergency: 4,
    high: 24,
    medium: 72,
    low: 168
  };
  
  return hoursSinceRequest > (slaHours[this.priority] || 72);
});

maintenanceRequestSchema.virtual('totalCost').get(function() {
  const partsCost = this.partsUsed?.reduce((sum, part) => sum + (part.cost || 0), 0) || 0;
  const laborCost = (this.laborHours || 0) * (this.laborRate || 0);
  return partsCost + laborCost;
});

// Instance Methods
maintenanceRequestSchema.methods.acknowledge = function(acknowledgedBy) {
  this.status = 'acknowledged';
  this.acknowledgedAt = new Date();
  this.acknowledgedBy = acknowledgedBy;
  
  this.statusHistory.push({
    status: 'acknowledged',
    changedBy: acknowledgedBy,
    notes: 'Request acknowledged'
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.schedule = function(scheduledDate, timeSlot, scheduledBy) {
  this.status = 'scheduled';
  this.scheduledDate = scheduledDate;
  this.scheduledTimeSlot = timeSlot;
  
  this.statusHistory.push({
    status: 'scheduled',
    changedBy: scheduledBy,
    notes: `Scheduled for ${scheduledDate.toLocaleDateString()} ${timeSlot}`
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.assignVendor = function(vendorId, assignedBy) {
  this.assignedTo = vendorId;
  this.assignedAt = new Date();
  
  this.statusHistory.push({
    status: this.status,
    changedBy: assignedBy,
    notes: 'Vendor assigned'
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.startWork = function(startedBy) {
  this.status = 'in_progress';
  this.startedAt = new Date();
  
  this.statusHistory.push({
    status: 'in_progress',
    changedBy: startedBy,
    notes: 'Work started'
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.completeWork = function(workDetails, completedBy) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.workPerformed = workDetails.workPerformed;
  this.partsUsed = workDetails.partsUsed || [];
  this.laborHours = workDetails.laborHours;
  this.actualCost = workDetails.actualCost;
  
  this.statusHistory.push({
    status: 'completed',
    changedBy: completedBy,
    notes: 'Work completed'
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.close = function(closedBy) {
  this.status = 'closed';
  this.closedAt = new Date();
  
  this.statusHistory.push({
    status: 'closed',
    changedBy: closedBy,
    notes: 'Request closed'
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.cancel = function(reason, cancelledBy) {
  this.status = 'cancelled';
  
  this.statusHistory.push({
    status: 'cancelled',
    changedBy: cancelledBy,
    notes: `Cancelled: ${reason}`
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.addUpdate = function(message, sentBy) {
  this.updates.push({
    message,
    sentBy,
    sentAt: new Date()
  });
  
  return this.save();
};

maintenanceRequestSchema.methods.submitFeedback = function(rating, feedback) {
  this.tenantRating = rating;
  this.tenantFeedback = feedback;
  this.feedbackSubmittedAt = new Date();
  
  return this.save();
};

// Static Methods
maintenanceRequestSchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenant: tenantId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('property', 'title address')
    .populate('assignedTo', 'firstName lastName company phone')
    .sort({ requestedDate: -1 });
};

maintenanceRequestSchema.statics.findByProperty = function(propertyId, options = {}) {
  const query = { property: propertyId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('tenant', 'firstName lastName phone email')
    .populate('assignedTo', 'firstName lastName company phone')
    .sort({ requestedDate: -1 });
};

maintenanceRequestSchema.statics.findOpenRequests = function() {
  return this.find({
    status: { $in: ['submitted', 'acknowledged', 'scheduled', 'in_progress'] }
  })
    .populate('tenant', 'firstName lastName phone')
    .populate('property', 'title address')
    .sort({ priority: -1, requestedDate: 1 });
};

maintenanceRequestSchema.statics.findOverdueRequests = function() {
  return this.find({
    status: { $in: ['submitted', 'acknowledged', 'scheduled', 'in_progress'] }
  })
    .populate('tenant', 'firstName lastName phone')
    .populate('property', 'title address')
    .then(requests => requests.filter(req => req.isOverdue));
};

maintenanceRequestSchema.statics.findEmergencyRequests = function() {
  return this.find({
    priority: 'emergency',
    status: { $nin: ['completed', 'closed', 'cancelled'] }
  })
    .populate('tenant', 'firstName lastName phone')
    .populate('property', 'title address')
    .sort({ requestedDate: 1 });
};

maintenanceRequestSchema.statics.getStatsByProperty = async function(propertyId, startDate, endDate) {
  const match = { property: propertyId };
  
  if (startDate && endDate) {
    match.requestedDate = { $gte: startDate, $lte: endDate };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgResolutionTime: { $avg: '$resolutionTime' },
        totalCost: { $sum: '$actualCost' },
        avgRating: { $avg: '$tenantRating' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

maintenanceRequestSchema.statics.getStatsByTenant = async function(tenantId) {
  return this.aggregate([
    { $match: { tenant: tenantId } },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        openRequests: {
          $sum: {
            $cond: [
              { $in: ['$status', ['submitted', 'acknowledged', 'scheduled', 'in_progress']] },
              1,
              0
            ]
          }
        },
        avgResponseTime: { $avg: '$responseTime' },
        avgResolutionTime: { $avg: '$resolutionTime' }
      }
    }
  ]);
};

module.exports = mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
