const mongoose = require('mongoose');
const { kenyaPhoneValidator } = require('../utils/kenyanValidators');

const UserSchema = new mongoose.Schema({
  // Kenyan phone as primary ID
  phone: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: kenyaPhoneValidator,
      message: 'Invalid Kenyan phone (2547XXXXXXXX)'
    }
  },

  // M-Pesa verification
  mpesaVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,

  // Role-based access
  role: {
    type: String,
    enum: ['tenant', 'landlord', 'manager', 'vendor'],
    required: true
  },

  // Nairobi-specific fields
  idNumber: {
    type: String,
    validate: {
      validator: function(v) {
        return /^\d{8}$/.test(v); // Kenyan ID format
      },
      message: 'Invalid Kenyan ID number'
    }
  },
  kraPin: String, // For landlord tax reporting

  // Timestamps with Nairobi timezone
  createdAt: {
    type: Date,
    default: () => new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
  }
}, { versionKey: false });

// Index for faster phone lookups
UserSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
