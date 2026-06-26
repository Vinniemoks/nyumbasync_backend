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
