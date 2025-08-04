const mongoose = require('mongoose');

const LeaseSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Kenyan legal terms
  terms: {
    durationMonths: {
      type: Number,
      min: 6,
      max: 24 // Standard Kenyan leases
    },
    rentAmount: Number,
    depositAmount: Number,
    terminationNotice: {
      type: Number,
      default: 2, // Months (for landlords)
      validate: {
        validator: function(v) {
          return this.landlord ? v >= 2 : v >= 1; // 2mo landlord, 1mo tenant
        }
      }
    }
  },

  // Digital signing
  signatures: {
    landlord: {
      signedAt: Date,
      ipAddress: String // For legal tracing
    },
    tenant: {
      signedAt: Date,
      ipAddress: String
    }
  },

  // PDF snapshot
  documentUrl: String // S3/Cloudinary link
}, { timestamps: true });

module.exports = mongoose.model('Lease', LeaseSchema);