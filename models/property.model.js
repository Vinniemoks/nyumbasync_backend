const mongoose = require('mongoose');
const { Schema } = mongoose;

const PropertySchema = new Schema({
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
      validate: {
        validator: function(v) {
          return v[0] >= 36.65 && v[0] <= 37.05 && // Longitude bounds
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
    required: true
  },

  // Kenyan rental features
  waterSource: {
    type: String,
    enum: ['county', 'borehole', 'tank'],
    default: 'county'
  },
  waterSchedule: Map, // For rationed areas

  // Legal compliance
  deposit: {
    type: Number,
    validate: {
      validator: function(v) {
        return v <= this.rent * 3; // Max 3x rent
      },
      message: 'Deposit exceeds Kenyan legal limit'
    }
  },

  // Indexes
  index: {
    location: '2dsphere',
    subcounty: 1,
    rent: 1
  }
});
