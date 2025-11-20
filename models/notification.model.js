const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Notification Model
 * Centralized notification system for all stakeholders
 */
const notificationSchema = new Schema({
  // Recipient information
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    index: true
  },
  
  recipientRole: {
    type: String,
    enum: ['tenant', 'landlord', 'vendor', 'agent', 'property_manager', 'admin'],
    required: true,
    index: true
  },
  
  // Notification details
  type: {
    type: String,
    enum: [
      // Tenant notifications
      'rent_reminder',
      'rent_overdue',
      'lease_expiring',
      'maintenance_update',
      'maintenance_scheduled',
      'maintenance_completed',
      'move_in_reminder',
      'move_out_reminder',
      'document_required',
      
      // Landlord notifications
      'new_application',
      'rent_received',
      'maintenance_request',
      'lease_signed',
      'tenant_move_out_notice',
      'property_inspection_due',
      'vendor_assigned',
      'payment_failed',
      
      // Vendor notifications
      'work_order_assigned',
      'work_order_updated',
      'payment_processed',
      'rating_received',
      
      // Agent notifications
      'new_lead',
      'showing_scheduled',
      'offer_received',
      'commission_ready',
      
      // Property Manager notifications
      'property_added',
      'tenant_issue',
      'financial_report_ready',
      'compliance_alert',
      
      // General
      'system_alert',
      'message_received',
      'task_assigned',
      'document_uploaded'
    ],
    required: true,
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Rich content
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Related entities
  relatedEntity: {
    entityType: {
      type: String,
      enum: ['Property', 'Contact', 'Transaction', 'MaintenanceRequest', 'Task', 'Document']
    },
    entityId: Schema.Types.ObjectId
  },
  
  // Delivery channels
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  
  // Delivery status
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending',
    index: true
  },
  
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  
  // Action button
  actionUrl: String,
  actionLabel: String,
  
  // Grouping
  category: {
    type: String,
    enum: ['payment', 'maintenance', 'lease', 'communication', 'task', 'alert'],
    index: true
  },
  
  // Expiry
  expiresAt: Date,
  
  // Metadata
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  metadata: Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
notificationSchema.index({ recipientRole: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { sparse: true });

// Instance Methods
notificationSchema.methods.markAsSent = function() {
  this.status = 'sent';
  this.sentAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.metadata = { ...this.metadata, failureReason: reason };
  return this.save();
};

// Static Methods
notificationSchema.statics.createNotification = async function(data) {
  const notification = await this.create(data);
  
  // Trigger delivery based on channels
  if (notification.channels.email) {
    // Queue email delivery
  }
  if (notification.channels.sms) {
    // Queue SMS delivery
  }
  if (notification.channels.push) {
    // Queue push notification
  }
  
  return notification;
};

notificationSchema.statics.getUnreadCount = function(recipientId) {
  return this.countDocuments({
    recipient: recipientId,
    status: { $in: ['pending', 'sent', 'delivered'] }
  });
};

notificationSchema.statics.getByRecipient = function(recipientId, options = {}) {
  const query = { recipient: recipientId };
  
  if (options.unreadOnly) {
    query.status = { $in: ['pending', 'sent', 'delivered'] };
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

notificationSchema.statics.markAllAsRead = function(recipientId) {
  return this.updateMany(
    {
      recipient: recipientId,
      status: { $in: ['pending', 'sent', 'delivered'] }
    },
    {
      status: 'read',
      readAt: new Date()
    }
  );
};

notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

module.exports = mongoose.model('Notification', notificationSchema);
