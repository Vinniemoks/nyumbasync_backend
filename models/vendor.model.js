const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
  company: {
    type: String,
    required: true
  },
  contact: {
    type: String,
    validate: {
      validator: v => /^254[17]\d{8}$/.test(v),
      message: 'Invalid Kenyan phone'
    }
  },

  // Link to a registered platform user (role: vendor)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    sparse: true
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    validate: {
      validator: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email address'
    }
  },

  // Commission the platform keeps on vendor payouts (default 5%)
  commissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 5
  },

  // Nairobi service areas
  subcounties: [{
    type: String,
    enum: [
      'Westlands', 'Dagoretti', 'Embakasi',
      'Kasarani', 'Langata', 'Starehe'
    ]
  }],

  // Specializations
  services: [{
    type: String,
    enum: [
      'plumbing', 'electrical',
      'carpentry', 'cleaning',
      'security'
    ]
  }],

  // Performance metrics
  avgResponseTime: Number, // Hours
  rating: {
    type: Number,
    min: 1,
    max: 5
  },

  // Kenyan business compliance
  kraCertified: Boolean,
  businessPermit: String
});

module.exports = mongoose.model('Vendor', VendorSchema);
