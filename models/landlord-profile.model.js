const mongoose = require('mongoose');
const { Schema } = mongoose;

const landlordProfileSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Account Type
  accountType: {
    type: String,
    enum: ['primary_landlord', 'property_manager', 'staff'],
    required: true,
    default: 'primary_landlord'
  },
  
  // Two-Factor Authentication
  twoFactorAuth: {
    enabled: { type: Boolean, default: false, required: true },
    secret: { type: String, select: false },
    backupCodes: [{ 
      code: { type: String, select: false },
      used: { type: Boolean, default: false }
    }],
    verifiedAt: Date,
    trustedDevices: [{
      deviceId: String,
      deviceName: String,
      lastUsed: Date,
      expiresAt: Date
    }]
  },
  
  // Master Service Agreement
  serviceAgreement: {
    accepted: { type: Boolean, default: false },
    version: String,
    acceptedAt: Date,
    ipAddress: String,
    userAgent: String,
    digitalSignature: String
  },
  
  // Portfolio Information
  portfolio: {
    totalProperties: { type: Number, default: 0 },
    totalUnits: { type: Number, default: 0 },
    occupiedUnits: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 }
  },
  
  // Verification Status
  verification: {
    status: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified'
    },
    documents: [{
      type: { type: String, enum: ['tax_bill', 'title_deed', 'certificate_of_occupancy', 'insurance', 'kra_pin', 'id_document'] },
      url: String,
      uploadedAt: Date,
      verifiedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      rejectionReason: String
    }],
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Permissions (for staff/managers)
  permissions: {
    properties: { view: Boolean, edit: Boolean, delete: Boolean },
    financial: { view: Boolean, edit: Boolean, export: Boolean },
    tenants: { view: Boolean, edit: Boolean, communicate: Boolean },
    maintenance: { view: Boolean, assign: Boolean, approve: Boolean },
    documents: { view: Boolean, upload: Boolean, delete: Boolean },
    reports: { view: Boolean, generate: Boolean, export: Boolean },
    settings: { view: Boolean, edit: Boolean },
    users: { create: Boolean, edit: Boolean, delete: Boolean }
  },
  
  // Assigned Properties (for managers/staff)
  assignedProperties: [{
    type: Schema.Types.ObjectId,
    ref: 'Property'
  }],
  
  // Bank Integration
  bankAccounts: [{
    accountId: String,
    bankName: String,
    accountNumber: String,
    accountType: String,
    isPrimary: { type: Boolean, default: false },
    plaidAccessToken: { type: String, select: false },
    plaidItemId: String,
    lastSynced: Date,
    status: { type: String, enum: ['active', 'inactive', 'error'], default: 'active' }
  }],
  
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    autoRentReminders: { type: Boolean, default: true },
    autoLateFees: { type: Boolean, default: false },
    currency: { type: String, default: 'KES' },
    timezone: { type: String, default: 'Africa/Nairobi' },
    language: { type: String, default: 'en' }
  },
  
  // Subscription/Plan
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'professional', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'inactive', 'suspended', 'cancelled'], default: 'active' },
    startDate: Date,
    endDate: Date,
    autoRenew: { type: Boolean, default: true }
  },
  
  // Activity Tracking
  lastActive: Date,
  loginHistory: [{
    timestamp: Date,
    ipAddress: String,
    userAgent: String,
    location: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
landlordProfileSchema.index({ user: 1 });
landlordProfileSchema.index({ accountType: 1 });
landlordProfileSchema.index({ 'verification.status': 1 });
landlordProfileSchema.index({ 'subscription.status': 1 });

// Virtuals
landlordProfileSchema.virtual('occupancyRate').get(function() {
  if (this.portfolio.totalUnits === 0) return 0;
  return (this.portfolio.occupiedUnits / this.portfolio.totalUnits) * 100;
});

// Methods
landlordProfileSchema.methods.generateBackupCodes = function() {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push({ code, used: false });
  }
  this.twoFactorAuth.backupCodes = codes;
  return codes.map(c => c.code);
};

landlordProfileSchema.methods.hasPermission = function(category, action) {
  if (this.accountType === 'primary_landlord') return true;
  return this.permissions[category] && this.permissions[category][action];
};

landlordProfileSchema.methods.updatePortfolioStats = async function() {
  const Property = mongoose.model('Property');
  const properties = await Property.find({ landlord: this.user });
  
  this.portfolio.totalProperties = properties.length;
  this.portfolio.totalUnits = properties.reduce((sum, p) => sum + (p.houses?.length || 1), 0);
  this.portfolio.occupiedUnits = properties.reduce((sum, p) => {
    if (p.houses?.length) {
      return sum + p.houses.filter(h => h.status === 'occupied').length;
    }
    return sum + (p.status === 'occupied' ? 1 : 0);
  }, 0);
  
  await this.save();
};

module.exports = mongoose.model('LandlordProfile', landlordProfileSchema);
