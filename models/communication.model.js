const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Communication Model
 * Tracks all communications between stakeholders
 */
const communicationSchema = new Schema({
  // Thread identification
  threadId: {
    type: String,
    index: true
  },
  
  // Participants
  participants: [{
    contact: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    role: {
      type: String,
      enum: ['tenant', 'landlord', 'vendor', 'agent', 'property_manager']
    },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: Date
  }],
  
  // Message details
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    index: true
  },
  
  senderRole: {
    type: String,
    enum: ['tenant', 'landlord', 'vendor', 'agent', 'property_manager', 'system'],
    required: true
  },
  
  messageType: {
    type: String,
    enum: ['text', 'email', 'sms', 'system', 'automated'],
    default: 'text'
  },
  
  subject: String,
  
  body: {
    type: String,
    required: true,
    maxlength: 5000
  },
  
  // Attachments
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Context
  relatedTo: {
    entityType: {
      type: String,
      enum: ['Property', 'Transaction', 'MaintenanceRequest', 'Application', 'Lease']
    },
    entityId: Schema.Types.ObjectId
  },
  
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent',
    index: true
  },
  
  deliveredAt: Date,
  
  readBy: [{
    contact: { type: Schema.Types.ObjectId, ref: 'Contact' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // Priority
  priority: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Tags
  tags: [String],
  
  // Reply tracking
  inReplyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Communication'
  },
  
  // Metadata
  metadata: Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
communicationSchema.index({ threadId: 1, createdAt: -1 });
communicationSchema.index({ sender: 1, createdAt: -1 });
communicationSchema.index({ 'participants.contact': 1, createdAt: -1 });
communicationSchema.index({ property: 1, createdAt: -1 });
communicationSchema.index({ 'relatedTo.entityType': 1, 'relatedTo.entityId': 1 });

// Instance Methods
communicationSchema.methods.markAsRead = function(contactId) {
  const alreadyRead = this.readBy.some(
    r => r.contact.toString() === contactId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      contact: contactId,
      readAt: new Date()
    });
    
    // Update participant's lastReadAt
    const participant = this.participants.find(
      p => p.contact.toString() === contactId.toString()
    );
    if (participant) {
      participant.lastReadAt = new Date();
    }
    
    // Update status if all participants have read
    if (this.readBy.length === this.participants.length) {
      this.status = 'read';
    }
  }
  
  return this.save();
};

communicationSchema.methods.addParticipant = function(contactId, role) {
  const exists = this.participants.some(
    p => p.contact.toString() === contactId.toString()
  );
  
  if (!exists) {
    this.participants.push({
      contact: contactId,
      role,
      joinedAt: new Date()
    });
  }
  
  return this.save();
};

// Static Methods
communicationSchema.statics.createThread = async function(data) {
  const threadId = `THREAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return this.create({
    ...data,
    threadId
  });
};

communicationSchema.statics.getThread = function(threadId, options = {}) {
  const query = { threadId };
  
  return this.find(query)
    .populate('sender', 'firstName lastName email')
    .populate('participants.contact', 'firstName lastName email')
    .sort({ createdAt: 1 })
    .limit(options.limit || 100);
};

communicationSchema.statics.getByContact = function(contactId, options = {}) {
  const query = {
    $or: [
      { sender: contactId },
      { 'participants.contact': contactId }
    ]
  };
  
  if (options.unreadOnly) {
    query['readBy.contact'] = { $ne: contactId };
  }
  
  return this.find(query)
    .populate('sender', 'firstName lastName email')
    .populate('property', 'title address')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

communicationSchema.statics.getUnreadCount = function(contactId) {
  return this.countDocuments({
    'participants.contact': contactId,
    'readBy.contact': { $ne: contactId }
  });
};

communicationSchema.statics.getByProperty = function(propertyId, options = {}) {
  return this.find({ property: propertyId })
    .populate('sender', 'firstName lastName email')
    .populate('participants.contact', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

communicationSchema.statics.searchMessages = function(contactId, searchTerm) {
  return this.find({
    $or: [
      { sender: contactId },
      { 'participants.contact': contactId }
    ],
    $text: { $search: searchTerm }
  })
    .populate('sender', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(20);
};

// Text index for search
communicationSchema.index({ body: 'text', subject: 'text' });

module.exports = mongoose.model('Communication', communicationSchema);
