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

  // Role-based access control
  role: {
    type: String,
    enum: ['tenant', 'landlord', 'manager', 'vendor', 'admin'],
    required: true,
    default: 'tenant'
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

  // Verification status
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
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
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ subcounty: 1 });

// Middleware
UserSchema.pre('save', async function(next) {
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
  correctPassword: async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  },

  changedPasswordAfter: function(JWTTimestamp) {
    if (this.passwordChangedAt) {
      const changedTimestamp = parseInt(
        this.passwordChangedAt.getTime() / 1000,
        10
      );
      return JWTTimestamp < changedTimestamp;
    }
    return false;
  },

  createPasswordResetToken: function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    this.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    return resetToken;
  },

  createVerificationCode: function() {
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
  findByIdentifier: function(identifier) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    return this.findOne(
      isEmail 
        ? { email: identifier.toLowerCase() }
        : { phone: identifier }
    );
  }
};

module.exports = mongoose.model('User', UserSchema);