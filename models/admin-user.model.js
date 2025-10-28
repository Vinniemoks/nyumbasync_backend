const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminUserSchema = new mongoose.Schema({
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminRole',
    required: true
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  lastLogin: {
    type: Date
  },
  lastPasswordChange: {
    type: Date
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  allowedIPs: [{
    type: String,
    validate: {
      validator: function(v) {
        // Basic IP validation regex
        return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v);
      },
      message: props => `${props.value} is not a valid IP address!`
    }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  auditLog: [{
    action: String,
    timestamp: Date,
    ipAddress: String,
    userAgent: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Add methods for password management
adminUserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Method to validate allowed IPs
adminUserSchema.methods.isIPAllowed = function(ip) {
  return this.allowedIPs.length === 0 || this.allowedIPs.includes(ip);
};

// Method to log admin activity
adminUserSchema.methods.logActivity = function(action, details, ip, userAgent) {
  this.auditLog.push({
    action,
    timestamp: new Date(),
    ipAddress: ip,
    userAgent: userAgent,
    details
  });
  return this.save();
};

// Method to handle failed login attempts
adminUserSchema.methods.handleFailedLogin = function() {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
    this.status = 'suspended';
  }
  return this.save();
};

// Method to reset login attempts
adminUserSchema.methods.resetLoginAttempts = function() {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this.save();
};

// Add indexes
adminUserSchema.index({ role: 1 });
adminUserSchema.index({ status: 1 });
adminUserSchema.index({ 'auditLog.timestamp': -1 });

module.exports = mongoose.model('AdminUser', adminUserSchema);