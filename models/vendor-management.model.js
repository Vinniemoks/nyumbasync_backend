const mongoose = require('mongoose');
const { Schema } = mongoose;

const vendorManagementSchema = new Schema({
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Vendor Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  category: {
    type: String,
    required: true,
    enum: [
      'plumber', 'electrician', 'carpenter', 'painter', 
      'cleaner', 'security', 'landscaper', 'hvac',
      'general_contractor', 'pest_control', 'locksmith', 'other'
    ]
  },
  
  // Contact Details
  contact: {
    phone: { type: String, required: true },
    email: String,
    alternatePhone: String,
    address: String
  },
  
  // Business Information
  business: {
    name: String,
    registrationNumber: String,
    taxId: String,
    insurancePolicy: String,
    licenseNumber: String,
    licenseExpiry: Date
  },
  
  // Performance Tracking
  performance: {
    rating: { type: Number, min: 0, max: 5, default: 0 },
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    averageResponseTime: Number, // in hours
    averageCompletionTime: Number, // in hours
    onTimeCompletion: { type: Number, default: 0 } // percentage
  },
  
  // Financial
  pricing: {
    hourlyRate: Number,
    callOutFee: Number,
    currency: { type: String, default: 'KES' }
  },
  
  totalPaid: { type: Number, default: 0 },
  
  // Service History
  serviceHistory: [{
    maintenanceRequest: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest' },
    property: { type: Schema.Types.ObjectId, ref: 'Property' },
    date: Date,
    cost: Number,
    rating: Number,
    notes: String
  }],
  
  // Reviews
  reviews: [{
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    date: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'blacklisted'],
    default: 'active'
  },
  
  isPreferred: { type: Boolean, default: false },
  
  // Availability
  availability: {
    days: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }],
    hours: String,
    emergencyAvailable: { type: Boolean, default: false }
  },
  
  // Documents
  documents: [{
    type: { type: String, enum: ['license', 'insurance', 'certificate', 'contract', 'other'] },
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    expiryDate: Date
  }],
  
  notes: String
}, {
  timestamps: true
});

// Indexes
vendorManagementSchema.index({ landlord: 1, category: 1 });
vendorManagementSchema.index({ status: 1 });
vendorManagementSchema.index({ isPreferred: 1 });

// Methods
vendorManagementSchema.methods.updatePerformance = async function() {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const requests = await MaintenanceRequest.find({ assignedVendor: this._id });
  
  this.performance.totalJobs = requests.length;
  this.performance.completedJobs = requests.filter(r => r.status === 'completed').length;
  
  if (this.performance.completedJobs > 0) {
    const completedRequests = requests.filter(r => r.status === 'completed');
    
    // Calculate average response time
    const responseTimes = completedRequests
      .filter(r => r.assignedAt && r.startedAt)
      .map(r => (r.startedAt - r.assignedAt) / (1000 * 60 * 60)); // hours
    
    if (responseTimes.length > 0) {
      this.performance.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }
    
    // Calculate average completion time
    const completionTimes = completedRequests
      .filter(r => r.startedAt && r.completedAt)
      .map(r => (r.completedAt - r.startedAt) / (1000 * 60 * 60)); // hours
    
    if (completionTimes.length > 0) {
      this.performance.averageCompletionTime = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
    }
  }
  
  await this.save();
};

vendorManagementSchema.methods.addReview = function(reviewerId, rating, comment) {
  this.reviews.push({
    reviewer: reviewerId,
    rating,
    comment,
    date: new Date()
  });
  
  // Recalculate average rating
  const totalRating = this.reviews.reduce((sum, r) => sum + r.rating, 0);
  this.performance.rating = totalRating / this.reviews.length;
  
  return this.save();
};

module.exports = mongoose.model('VendorManagement', vendorManagementSchema);
