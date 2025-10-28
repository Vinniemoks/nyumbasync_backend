const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: [
      'authentication',
      'authorization',
      'user_management',
      'property_management',
      'financial',
      'maintenance',
      'system',
      'security',
      'other'
    ],
    required: true,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: String,
  status: {
    type: String,
    enum: ['success', 'failure', 'warning'],
    default: 'success'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);