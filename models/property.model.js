const mongoose = require('mongoose');
const { Schema } = mongoose;

const PropertySchema = new Schema({
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Property details
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  rent: {
    type: Number,
    required: [true, 'Monthly rent amount is required'],
    min: [500, 'Rent cannot be less than KES 500']
  },

  // Nairobi geo-fencing
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point']
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= 36.65 && v[0] <= 37.05 && // Longitude bounds
                 v[1] >= -1.55 && v[1] <= -1.10;  // Latitude bounds
        },
        message: 'Coordinates must be within Nairobi County'
      }
    }
  },

  // Nairobi administrative units
  subcounty: {
    type: String,
    enum: [
      'Westlands', 'Dagoretti', 'Embakasi', 
      'Kasarani', 'Langata', 'Starehe'
    ],
    required: [true, 'Subcounty is required']
  },

  // Property features
  bedrooms: {
    type: Number,
    min: [0, 'Bedrooms cannot be negative']
  },
  bathrooms: {
    type: Number,
    min: [0, 'Bathrooms cannot be negative']
  },

  // Kenyan utilities
  waterSource: {
    type: String,
    enum: ['county', 'borehole', 'tank'],
    default: 'county'
  },
  waterSchedule: {
    type: Map,
    of: String // Stores rationing schedule if applicable
  },
  powerBackup: {
    type: Boolean,
    default: false
  },

  // Legal compliance
  deposit: {
    type: Number,
    validate: {
      validator: function(v) {
        return v <= this.rent * 3; // Max 3x rent as per Kenyan law
      },
      message: 'Deposit cannot exceed 3 months rent'
    }
  },
  contractUrl: {
    type: String,
    match: [/^https?:\/\//, 'Please use a valid URL']
  },

  // Media
  images: [{
    url: String,
    caption: String
  }],

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes separately (correct way)
PropertySchema.index({ location: '2dsphere' }); // Geospatial index
PropertySchema.index({ subcounty: 1, rent: 1 }); // Compound index

// Add virtual for deposit calculation
PropertySchema.virtual('depositAmount').get(function() {
  return this.deposit || this.rent * 2; // Default 2 months deposit
});

// Validation for minimum rental period
PropertySchema.path('rent').validate(function(value) {
  return value >= 1000; // Minimum rent KES 1000
}, 'Rent must be at least KES 1000');

module.exports = mongoose.model('Property', PropertySchema);