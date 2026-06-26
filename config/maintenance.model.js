const mongoose = require('mongoose');

const MaintenanceSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Nairobi common issues
  issueType: {
    type: String,
    enum: [
      'plumbing', 'electrical', 
      'structural', 'security',
      'water', 'other'
    ],
    required: true
  },

  // Swahili-friendly descriptions
  description: {
    type: String,
    maxlength: 500
  },

  // Media attachments
  photos: [String], // Cloudinary URLs

  // Vendor assignment
  assignedVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  completionProof: String,

  // SLA tracking (Nairobi standards)
  status: {
    type: String,
    enum: ['reported', 'assigned', 'in_progress', 'completed'],
    default: 'reported'
  },
  priority: {
    type: String,
    enum: ['emergency', 'high', 'medium', 'low'],
    default: 'medium'
  }
}, { timestamps: true });

// Index for faster queries by location
MaintenanceSchema.index({
  'property.subcounty': 1,
  status: 1,
  priority: 1
});
