const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Property Interest Model
 * Records a tenant's expression of interest in a listed property.
 */
const propertyInterestSchema = new Schema({
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required'],
    index: true
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Tenant reference is required'],
    index: true
  },
  message: {
    type: String,
    maxlength: [1000, 'Message cannot exceed 1000 characters'],
    trim: true
  },
  preferredMoveInDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'viewing_scheduled', 'approved', 'rejected'],
    default: 'pending',
    index: true
  }
}, {
  timestamps: true
});

// Prevent duplicate pending interest from the same tenant on the same property
propertyInterestSchema.index({ property: 1, tenant: 1, status: 1 }, { sparse: true });

module.exports = mongoose.model('PropertyInterest', propertyInterestSchema);
