const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'payment_due',
      'payment_received',
      'maintenance_update',
      'property_approval',
      'lease_expiry',
      'inspection_scheduled',
      'document_expired',
      'system_alert'
    ]
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  channels: [{
    type: String,
    enum: ['email', 'sms', 'push', 'in_app'],
    required: true
  }],
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  },
  schedule: {
    type: Date,
    default: Date.now
  },
  expiresAt: Date,
  readAt: Date,
  deliveredAt: Date,
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,
  error: {
    code: String,
    message: String,
    details: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, status: 1 });
notificationSchema.index({ schedule: 1, status: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods
notificationSchema.methods.markAsRead = async function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = async function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

notificationSchema.methods.incrementRetry = async function(error) {
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  if (error) {
    this.error = {
      code: error.code || 'UNKNOWN',
      message: error.message,
      details: error.details
    };
  }
  return this.save();
};

// Static methods
notificationSchema.statics.getPendingNotifications = async function() {
  return this.find({
    status: 'pending',
    schedule: { $lte: new Date() },
    retryCount: { $lt: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS) || 3 }
  }).sort('schedule');
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    user: userId,
    status: { $in: ['sent', 'delivered'] }
  });
};

module.exports = mongoose.model('Notification', notificationSchema);