const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

/**
 * Tenant Portal Authentication Model
 * Handles passwordless authentication for tenant portal access
 */
const tenantPortalAuthSchema = new Schema({
  contact: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    unique: true,
    index: true
  },
  
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true
  },
  
  // Magic Link Authentication
  magicLinkToken: String,
  magicLinkExpiry: Date,
  
  // SMS/Phone Verification
  phoneVerificationCode: String,
  phoneVerificationExpiry: Date,
  phoneVerificationAttempts: {
    type: Number,
    default: 0
  },
  
  // Session Management
  activeSessions: [{
    token: String,
    deviceInfo: String,
    ipAddress: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    lastActivityAt: Date
  }],
  
  // Security
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  accountLockedUntil: Date,
  lastLoginAt: Date,
  lastLoginIP: String,
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Terms acceptance
  termsVersion: String,
  termsAcceptedAt: Date,
  privacyPolicyVersion: String,
  privacyPolicyAcceptedAt: Date

}, {
  timestamps: true
});

// Indexes
tenantPortalAuthSchema.index({ email: 1 });
tenantPortalAuthSchema.index({ magicLinkToken: 1 }, { sparse: true });
tenantPortalAuthSchema.index({ 'activeSessions.token': 1 });

// Instance Methods
tenantPortalAuthSchema.methods.generateMagicLink = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.magicLinkToken = crypto.createHash('sha256').update(token).digest('hex');
  this.magicLinkExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  return token; // Return unhashed token to send via email
};

tenantPortalAuthSchema.methods.generatePhoneVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  this.phoneVerificationCode = code;
  this.phoneVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.phoneVerificationAttempts = 0;
  return code;
};

tenantPortalAuthSchema.methods.verifyPhoneCode = function(code) {
  if (this.phoneVerificationAttempts >= 3) {
    throw new Error('Too many verification attempts. Please request a new code.');
  }
  
  if (!this.phoneVerificationCode || !this.phoneVerificationExpiry) {
    throw new Error('No verification code found. Please request a new code.');
  }
  
  if (new Date() > this.phoneVerificationExpiry) {
    throw new Error('Verification code has expired. Please request a new code.');
  }
  
  this.phoneVerificationAttempts += 1;
  
  if (this.phoneVerificationCode !== code) {
    return false;
  }
  
  // Clear verification data on success
  this.phoneVerificationCode = undefined;
  this.phoneVerificationExpiry = undefined;
  this.phoneVerificationAttempts = 0;
  
  return true;
};

tenantPortalAuthSchema.methods.createSession = function(deviceInfo, ipAddress) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(sessionToken).digest('hex');
  
  this.activeSessions.push({
    token: hashedToken,
    deviceInfo,
    ipAddress,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    lastActivityAt: new Date()
  });
  
  // Keep only last 5 sessions
  if (this.activeSessions.length > 5) {
    this.activeSessions = this.activeSessions.slice(-5);
  }
  
  this.lastLoginAt = new Date();
  this.lastLoginIP = ipAddress;
  this.failedLoginAttempts = 0;
  
  return sessionToken; // Return unhashed token
};

tenantPortalAuthSchema.methods.validateSession = function(sessionToken) {
  const hashedToken = crypto.createHash('sha256').update(sessionToken).digest('hex');
  
  const session = this.activeSessions.find(s => 
    s.token === hashedToken && 
    new Date() < s.expiresAt
  );
  
  if (session) {
    session.lastActivityAt = new Date();
    return true;
  }
  
  return false;
};

tenantPortalAuthSchema.methods.revokeSession = function(sessionToken) {
  const hashedToken = crypto.createHash('sha256').update(sessionToken).digest('hex');
  this.activeSessions = this.activeSessions.filter(s => s.token !== hashedToken);
  return this.save();
};

tenantPortalAuthSchema.methods.revokeAllSessions = function() {
  this.activeSessions = [];
  return this.save();
};

tenantPortalAuthSchema.methods.recordFailedLogin = function() {
  this.failedLoginAttempts += 1;
  
  // Lock account after 5 failed attempts for 30 minutes
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  return this.save();
};

tenantPortalAuthSchema.methods.isAccountLocked = function() {
  if (!this.accountLockedUntil) return false;
  
  if (new Date() > this.accountLockedUntil) {
    this.accountLockedUntil = undefined;
    this.failedLoginAttempts = 0;
    return false;
  }
  
  return true;
};

tenantPortalAuthSchema.methods.acceptTerms = function(termsVersion, privacyVersion) {
  this.termsVersion = termsVersion;
  this.termsAcceptedAt = new Date();
  this.privacyPolicyVersion = privacyVersion;
  this.privacyPolicyAcceptedAt = new Date();
  return this.save();
};

// Static Methods
tenantPortalAuthSchema.statics.findByEmail = function(email) {
  return this.findOne({ 
    email: email.toLowerCase().trim(),
    isActive: true 
  }).populate('contact');
};

tenantPortalAuthSchema.statics.findByMagicToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.findOne({
    magicLinkToken: hashedToken,
    magicLinkExpiry: { $gt: new Date() },
    isActive: true
  }).populate('contact');
};

tenantPortalAuthSchema.statics.cleanExpiredSessions = async function() {
  const now = new Date();
  
  return this.updateMany(
    { 'activeSessions.expiresAt': { $lt: now } },
    { $pull: { activeSessions: { expiresAt: { $lt: now } } } }
  );
};

module.exports = mongoose.model('TenantPortalAuth', tenantPortalAuthSchema);
