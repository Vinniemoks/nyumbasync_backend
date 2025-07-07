const mongoose = require('mongoose');
const { validatePhone } = require('../utils/kenyanValidators');

const UserSchema = new mongoose.Schema({
  // Kenyan phone as primary ID
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    validate: {
      validator: validatePhone,
      message: 'Invalid Kenyan phone (must start with 2547 or 2541)'
    }
  },

  // M-Pesa verification fields
  mpesaVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
  codeExpires: Date,

  // Role-based access control
  role: {
    type: String,
    enum: ['tenant', 'landlord', 'manager', 'vendor'],
    required: [true, 'User role is required'],
    default: 'tenant'
  },

  // Security fields
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false,
    minlength: 8
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  // Nairobi-specific identification
  idNumber: {
    type: String,
    validate: {
      validator: function(v) {
        return /^\d{8}$/.test(v); // Standard Kenyan ID format
      },
      message: 'Invalid Kenyan ID number (must be 8 digits)'
    }
  },
  kraPin: {
    type: String,
    validate: {
      validator: function(v) {
        return /^[A-Z]\d{9}[A-Z]$/.test(v); // KRA PIN format
      },
      message: 'Invalid KRA PIN format'
    }
  },

  // Profile information
  firstName: String,
  lastName: String,
  email: {
    type: String,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email address'
    }
  },

  // Nairobi location reference
  subcounty: {
    type: String,
    enum: [
      'Westlands', 'Dagoretti', 'Embakasi', 
      'Kasarani', 'Langata', 'Starehe', 'Kamukunji'
    ]
  },

  // Timestamps with Nairobi timezone
  createdAt: {
    type: Date,
    default: () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }))
  },
  updatedAt: {
    type: Date,
    default: () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }))
  }
}, { 
  versionKey: false,
  timestamps: false // We're handling timestamps manually for timezone
});

// Password hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = Date.now() - 1000; // Ensures token created after
    next();
  } catch (err) {
    next(err);
  }
});

// Method to check password
UserSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to create password reset token
UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Indexes for performance
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ idNumber: 1 }, { sparse: true });
UserSchema.index({ kraPin: 1 }, { sparse: true });

module.exports = mongoose.model('User', UserSchema);