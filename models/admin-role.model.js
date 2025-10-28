const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['superadmin', 'admin', 'moderator'],
    unique: true
  },
  permissions: [{
    type: String,
    enum: [
      'manage_users',
      'manage_properties',
      'manage_payments',
      'manage_maintenance',
      'manage_admins',
      'view_analytics',
      'manage_settings',
      'manage_backups',
      'manage_roles',
      'view_audit_logs'
    ]
  }],
  description: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes
adminRoleSchema.index({ name: 1 });

module.exports = mongoose.model('AdminRole', adminRoleSchema);