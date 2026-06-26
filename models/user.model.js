const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  validatePhone,
  validateKRAPin: validateKRA,
  validateNationalID: validateIDNumber
} = require('../utils/kenyanValidators');


const UserSchema = new mongoose.Schema({
  // Kenyan phone as primary ID
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    validate: {
      validator: validatePhone,
      message: 'Invalid Kenyan phone (must start with 2547 or 2541)'
    }
  },

  // Profile information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email address'
    }
  },
  //Mpesa
  mpesaVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
  verificationCodeExpiry: Date,
  isActive: {
    type: Boolean,
    default: true
  },

  // Nairobi-specific identification
  idNumber: {
    type: String,
    validate: {
      validator: validateIDNumber,
      message: 'Invalid Kenyan ID number'
    }
  },
  kraPin: {
    type: String,
    validate: {
      validator: validateKRA,
      message: 'Invalid KRA PIN format'
    }
  },

  // Location reference
  subcounty: {
    type: String,
    enum: [
      'Westlands', 'Dagoretti', 'Embakasi',
      'Kasarani', 'Langata', 'Starehe', 'Kamukunji'
    ]
  },

  // Role-based access control.
  // `role` is the user's *active* role (the portal they're currently using);
  // `roles` is every role the account holds. A user who is both a tenant and a
  // vendor has roles: ['tenant', 'vendor'] and switches `role` between them.
  role: {
    type: String,
    enum: ['tenant', 'landlord', 'agent', 'manager', 'vendor', 'admin'],
    required: true,
    default: 'tenant'
  },
  roles: {
    type: [String],
    enum: ['tenant', 'landlord', 'agent', 'manager', 'vendor', 'admin'],
    default: undefined
  },

  // Security fields
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false,
    minlength: 8,
    maxlength: 128
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  // Password history (prevent reuse)
  // Hide the whole array by default but keep it re-selectable as a unit via
  // .select('+passwordHistory'). Putting select:false on the nested `hash`
  // instead left it excluded even when the array was explicitly selected, so
  // reuse checks saw undefined hashes and never detected a reused password.
  passwordHistory: {
    type: [{
      hash: { type: String },
      changedAt: { type: Date, default: Date.now }
    }],
    select: false
  },

  // Multi-Factor Authentication (MFA)
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  mfaSecret: {
    type: String,
    select: false
  },
  // select:false must sit on the array path itself, not the element — on the
  // element it silently can't be re-selected with `.select('+mfaBackupCodes')`,
  // which left the codes undefined and broke backup-code login entirely.
  mfaBackupCodes: {
    type: [String],
    select: false
  },
  mfaVerified: {
    type: Boolean,
    default: false
  },

  // Biometric Authentication (Fingerprint, Face ID, Windows Hello, USB scanners, etc.)
  biometricEnabled: {
    type: Boolean,
    default: false
  },
  biometricCredentials: [{
    credentialId: String,
    credentialPublicKey: String,
    counter: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastUsed: Date
  }],
  biometricChallenge: String,
  challengeExpiry: Date,

  // Verification status
  isVerified: {
    type: Boolean,
    default: false
  },
  codeExpires: Date,

  // Account status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockedUntil: Date
}, {
  timestamps: {
    createdAt: 'joinedAt',
    updatedAt: 'lastUpdated'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ subcounty: 1 });

// Middleware

// Keep `role` (active) and `roles` (all) consistent. Legacy accounts that only
// ever set `role` get a single-element `roles`; if `roles` is provided, the
// active `role` is forced to be a member of it.
UserSchema.pre('save', function (next) {
  if (!this.roles || this.roles.length === 0) {
    this.roles = this.role ? [this.role] : [];
  } else {
    this.roles = [...new Set(this.roles)];
    if (!this.roles.includes(this.role)) {
      this.role = this.roles[0];
    }
  }
  next();
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = Date.now() - 1000;
    next();
  } catch (err) {
    next(err);
  }
});

// Instance methods
UserSchema.methods = {
  correctPassword: async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  },

  changedPasswordAfter: function (JWTTimestamp) {
    if (this.passwordChangedAt) {
      const changedTimestamp = parseInt(
        this.passwordChangedAt.getTime() / 1000,
        10
      );
      return JWTTimestamp < changedTimestamp;
    }
    return false;
  },

  createPasswordResetToken: function () {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
  },

  createVerificationCode: function () {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    this.verificationCode = crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');

    this.codeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return code;
  }
};

// Static methods
UserSchema.statics = {
  findByIdentifier: function (identifier) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    return this.findOne(
      isEmail
        ? { email: identifier.toLowerCase() }
        : { phone: identifier }
    );
  }
};

module.exports = mongoose.model('User', UserSchema);
