const mongoose = require('mongoose');
const validator = require('validator');
const { toJSON, paginate } = require('./plugins');

const tenantSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true
    },
    houseNumber: {
      type: String,
      required: true,
      trim: true
    },
    leaseStart: {
      type: Date,
      required: true,
      default: Date.now
    },
    leaseEnd: {
      type: Date,
      required: true,
      validate(value) {
        if (value <= this.leaseStart) {
          throw new Error('Lease end date must be after lease start date');
        }
      }
    },
    rentAmount: {
      type: Number,
      required: true,
      min: 0
    },
    rentDueDay: {
      type: Number,
      required: true,
      min: 1,
      max: 28
    },
    depositPaid: {
      type: Number,
      default: 0
    },
    emergencyContact: {
      name: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        trim: true,
        validate(value) {
          if (value && !validator.isMobilePhone(value, 'any', { strictMode: false })) {
            throw new Error('Invalid phone number');
          }
        }
      },
      relationship: {
        type: String,
        trim: true
      }
    },
    documents: [
      {
        name: {
          type: String,
          trim: true
        },
        url: {
          type: String,
          trim: true
        },
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'terminated'],
      default: 'pending'
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add plugins
tenantSchema.plugin(toJSON);
tenantSchema.plugin(paginate);

// Virtual for lease duration (in months)
tenantSchema.virtual('leaseDuration').get(function () {
  const diffInMonths = (this.leaseEnd - this.leaseStart) / (1000 * 60 * 60 * 24 * 30);
  return Math.round(diffInMonths);
});

// Virtual for rent status
tenantSchema.virtual('rentStatus').get(function () {
  const today = new Date();
  const rentDueDate = new Date(today.getFullYear(), today.getMonth(), this.rentDueDay);
  
  if (today > rentDueDate) {
    return 'overdue';
  } else if (today.getDate() >= this.rentDueDay - 5) {
    return 'due_soon';
  }
  return 'current';
});

// Virtual for lease status
tenantSchema.virtual('leaseStatus').get(function () {
  const today = new Date();
  if (today < this.leaseStart) {
    return 'not_started';
  } else if (today > this.leaseEnd) {
    return 'expired';
  }
  return 'active';
});

/**
 * Check if tenant exists for a user
 * @param {ObjectId} userId - The user's id
 * @param {ObjectId} [excludeTenantId] - The tenant id to exclude
 * @returns {Promise<boolean>}
 */
tenantSchema.statics.isTenant = async function (userId, excludeTenantId) {
  const tenant = await this.findOne({ 
    user: userId, 
    _id: { $ne: excludeTenantId },
    status: { $in: ['active', 'pending'] }
  });
  return !!tenant;
};

/**
 * Check if property has available units
 * @param {ObjectId} propertyId - The property id
 * @returns {Promise<boolean>}
 */
tenantSchema.statics.hasAvailableUnits = async function (propertyId) {
  try {
    const property = await mongoose.model('Property').findById(propertyId);
    if (!property) return false;
    
    const activeTenantCount = await this.countDocuments({ 
      property: propertyId, 
      status: { $in: ['active', 'pending'] }
    });
    
    return activeTenantCount < (property.houses?.length || property.totalUnits || 0);
  } catch (error) {
    console.error('Error checking available units:', error);
    return false;
  }
};

/**
 * Get tenants by property
 * @param {ObjectId} propertyId - The property id
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
tenantSchema.statics.getByProperty = async function (propertyId, options = {}) {
  const query = { property: propertyId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('user', 'name email phone')
    .populate('property', 'name address')
    .sort({ createdAt: -1 });
};

/**
 * Get overdue tenants
 * @returns {Promise<Array>}
 */
tenantSchema.statics.getOverdueTenants = async function () {
  const today = new Date();
  const currentDay = today.getDate();
  
  return this.find({
    status: 'active',
    rentDueDay: { $lt: currentDay }
  })
    .populate('user', 'name email phone')
    .populate('property', 'name address');
};

// Pre-save middleware to validate lease dates
tenantSchema.pre('save', function (next) {
  if (this.leaseEnd <= this.leaseStart) {
    next(new Error('Lease end date must be after lease start date'));
  } else {
    next();
  }
});

// Index for better query performance
tenantSchema.index({ user: 1, property: 1 });
tenantSchema.index({ property: 1, status: 1 });
tenantSchema.index({ status: 1, rentDueDay: 1 });

// Ensure model is not compiled multiple times
let Tenant;
try {
  Tenant = mongoose.model('Tenant');
} catch (error) {
  Tenant = mongoose.model('Tenant', tenantSchema);
}

module.exports = Tenant;