const mongoose = require('mongoose');
const { Schema } = mongoose;

const PropertySchema = new Schema({
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Landlord reference is required'],
    validate: {
      validator: async function(id) {
        const user = await mongoose.model('User').findById(id);
        return user && user.role === 'landlord';
      },
      message: 'Referenced user must be a landlord'
    }
  },

  // Property Identification
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    match: [/^[\w\s-]+$/, 'Title can only contain letters, numbers, spaces and hyphens']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    minlength: [50, 'Description must be at least 50 characters'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },

  // Financial Details
  rent: {
    type: Number,
    required: [true, 'Monthly rent amount is required'],
    min: [1000, 'Rent cannot be less than KES 1,000'],
    max: [1000000, 'Rent cannot exceed KES 1,000,000'],
    set: v => Math.round(v) // Store only whole numbers
  },
  currency: {
    type: String,
    default: 'KES',
    enum: {
      values: ['KES'],
      message: 'Only Kenyan Shillings (KES) are accepted'
    }
  },

  // Nairobi Geolocation
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function(v) {
          // Nairobi County bounding box coordinates
          return v.length === 2 && 
                 v[0] >= 36.65 && v[0] <= 37.05 && // Longitude range
                 v[1] >= -1.55 && v[1] <= -1.10;   // Latitude range
        },
        message: 'Coordinates must be within Nairobi County boundaries'
      }
    },
    address: {
      type: String,
      required: [true, 'Physical address is required']
    }
  },

  // Nairobi Administrative Units
  county: {
    type: String,
    default: 'Nairobi',
    immutable: true
  },
  subcounty: {
    type: String,
    required: [true, 'Subcounty is required'],
    enum: {
      values: [
        'Westlands', 'Dagoretti North', 'Dagoretti South', 
        'Embakasi East', 'Embakasi West', 'Embakasi Central',
        'Embakasi North', 'Embakasi South', 'Kasarani',
        'Langata', 'Starehe', 'Kamukunji', 'Mathare',
        'Roysambu', 'Ruaraka', 'Makadara'
      ],
      message: 'Invalid Nairobi subcounty'
    }
  },
  ward: String,

  // Property Characteristics
  type: {
    type: String,
    required: true,
    enum: {
      values: [
        'Apartment', 'Bedsitter', 'Single Room',
        'Maisonette', 'Bungalow', 'Townhouse',
        'Commercial Space', 'Hostel', 'Shared House'
      ],
      message: 'Invalid property type'
    }
  },
  bedrooms: {
    type: Number,
    required: true,
    min: [0, 'Bedrooms cannot be negative'],
    max: [20, 'Unrealistic number of bedrooms']
  },
  bathrooms: {
    type: Number,
    required: true,
    min: [0, 'Bathrooms cannot be negative'],
    max: [10, 'Unrealistic number of bathrooms']
  },
  floor: {
    type: Number,
    min: [0, 'Invalid floor number'],
    max: [100, 'Unrealistic floor number']
  },

  // Kenyan Utilities
  waterSource: {
    type: String,
    enum: ['county', 'borehole', 'tank', 'well'],
    default: 'county'
  },
  waterSchedule: {
    type: Map,
    of: String // Stores rationing schedule if applicable
  },
  powerBackup: {
    type: String,
    enum: ['none', 'generator', 'inverter', 'solar'],
    default: 'none'
  },
  internet: {
    type: Boolean,
    default: false
  },

  // Legal Compliance
  deposit: {
    type: Number,
    validate: {
      validator: function(v) {
        return v <= this.rent * 3; // Kenyan rental law maximum
      },
      message: 'Deposit cannot exceed 3 months rent'
    }
  },
  contractUrl: {
    type: String,
    match: [/^https?:\/\//, 'Please use a valid URL']
  },
  compliance: {
    ratesPaid: Boolean,
    nemaApproved: Boolean,
    fireCertificate: Boolean
  },

  // Media
  images: {
    type: [{
      url: String,
      caption: String,
      isPrimary: Boolean
    }],
    validate: {
      validator: function(v) {
        return v.length <= 20; // Maximum 20 images
      },
      message: 'Cannot upload more than 20 images'
    }
  },
  videoTour: String,

  // Status and Timings
  isAvailable: {
    type: Boolean,
    default: true
  },
  availableFrom: Date,
  viewingSchedule: [{
    day: String,
    hours: String
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========================
// INDEXES
// ========================
PropertySchema.index({ location: '2dsphere' }); // Geospatial queries
PropertySchema.index({ subcounty: 1, rent: 1 }); // Common filter combination
PropertySchema.index({ landlord: 1, isAvailable: 1 }); // Landlord dashboard
PropertySchema.index({ rent: 1, bedrooms: 1 }); // Tenant searches
PropertySchema.index({ title: 'text', description: 'text' }); // Full-text search

// ========================
// VIRTUAL PROPERTIES
// ========================
PropertySchema.virtual('depositAmount').get(function() {
  return this.deposit || this.rent * 2; // Default 2 months deposit
});

PropertySchema.virtual('formattedRent').get(function() {
  return `KES ${this.rent.toLocaleString('en-KE')}`;
});

PropertySchema.virtual('coordinates').get(function() {
  return this.location?.coordinates?.join(', ') || '';
});

// ========================
// INSTANCE METHODS
// ========================
PropertySchema.methods.getWaterStatus = function() {
  return this.waterSchedule && this.waterSchedule.size > 0 
    ? 'Rationed' 
    : 'Available';
};

PropertySchema.methods.getFullAddress = function() {
  return `${this.location.address}, ${this.subcounty}, Nairobi`;
};

// ========================
// MIDDLEWARE
// ========================
PropertySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure at least one image is marked as primary
  if (this.images && this.images.length > 0 && !this.images.some(img => img.isPrimary)) {
    this.images[0].isPrimary = true;
  }
  
  next();
});

PropertySchema.post('save', function(doc, next) {
  // Update landlord's properties count
  mongoose.model('User').updateOne(
    { _id: doc.landlord },
    { $inc: { propertyCount: 1 } }
  ).exec();
  next();
});

// ========================
// STATIC METHODS
// ========================
PropertySchema.statics.findBySubcounty = function(subcounty) {
  return this.find({ subcounty, isAvailable: true })
    .sort({ rent: 1 })
    .limit(100);
};

PropertySchema.statics.getRentStats = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$subcounty',
        averageRent: { $avg: '$rent' },
        minRent: { $min: '$rent' },
        maxRent: { $max: '$rent' },
        count: { $sum: 1 }
      }
    },
    { $sort: { averageRent: 1 } }
  ]);
};

module.exports = mongoose.model('Property', PropertySchema);