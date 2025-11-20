const mongoose = require('mongoose');
const { Schema } = mongoose;

const propertySchema = new Schema({
  // Basic property information
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

  // Property type and details
  type: {
    type: String,
    required: true,
    enum: [
      'apartment', 'house', 'studio', 'bedsitter', 'commercial', 'office',
      'Apartment', 'Bedsitter', 'Single Room', 'Maisonette', 'Bungalow',
      'Townhouse', 'Commercial Space', 'Hostel', 'Shared House'
    ],
    index: true
  },
  bedrooms: {
    type: Number,
    required: true,
    min: 0,
    max: 20
  },
  bathrooms: {
    type: Number,
    required: true,
    min: 0,
    max: 20
  },
  squareFootage: {
    type: Number,
    min: 0
  },
  floor: {
    type: Number,
    min: 0,
    max: 100
  },

  // Location details
  address: {
    street: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true, index: true },
    city: { type: String, required: true, trim: true, index: true },
    county: { type: String, required: true, trim: true, default: 'Nairobi' },
    postalCode: { type: String, trim: true },
    coordinates: {
      type: { type: String, default: 'Point', enum: ['Point'] },
      coordinates: {
        type: [Number],
        validate: {
          validator: function(v) {
            if (!v || v.length !== 2) return true;
            return v[0] >= 36.65 && v[0] <= 37.05 && v[1] >= -1.55 && v[1] <= -1.10;
          },
          message: 'Coordinates must be within Nairobi County boundaries'
        }
      }
    }
  },
  subcounty: {
    type: String,
    enum: [
      'Westlands', 'Dagoretti North', 'Dagoretti South',
      'Embakasi East', 'Embakasi West', 'Embakasi Central',
      'Embakasi North', 'Embakasi South', 'Kasarani',
      'Langata', 'Starehe', 'Kamukunji', 'Mathare',
      'Roysambu', 'Ruaraka', 'Makadara'
    ]
  },
  ward: String,

  // Financial information
  rent: {
    amount: {
      type: Number,
      required: [true, 'Monthly rent amount is required'],
      min: [1000, 'Rent cannot be less than KES 1,000'],
      max: [1000000, 'Rent cannot exceed KES 1,000,000'],
      set: v => Math.round(v)
    },
    currency: { type: String, default: 'KES', enum: ['KES', 'USD'] },
    paymentFrequency: { type: String, enum: ['monthly', 'quarterly', 'annually'], default: 'monthly' }
  },
  deposit: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(v) { return v <= this.rent.amount * 3; },
      message: 'Deposit cannot exceed 3 months rent'
    }
  },
  serviceCharge: { type: Number, default: 0, min: 0 },

  // Kenyan Utilities
  waterSource: { type: String, enum: ['county', 'borehole', 'tank', 'well'], default: 'county' },
  waterSchedule: { type: Map, of: String },
  powerBackup: { type: String, enum: ['none', 'generator', 'inverter', 'solar'], default: 'none' },
  internet: { type: Boolean, default: false },

  // Property status and availability
  status: { type: String, enum: ['available', 'occupied', 'maintenance', 'unavailable'], default: 'available', index: true },
  isAvailable: { type: Boolean, default: true },
  furnished: { type: Boolean, default: false },
  petFriendly: { type: Boolean, default: false },
  availableFrom: Date,
  viewingSchedule: [{ day: String, hours: String }],

  // Owner/Manager information
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
    },
    index: true
  },
  manager: { type: Schema.Types.ObjectId, ref: 'User' },

  // Related Contacts - The "Sync" Magic
  relatedContacts: [{
    contact: { type: Schema.Types.ObjectId, ref: 'Contact' },
    relationship: {
      type: String,
      enum: ['interested', 'viewed', 'offered', 'owner', 'tenant', 'agent']
    },
    date: { type: Date, default: Date.now },
    notes: String
  }],

  // Transaction History
  transactionHistory: [{
    type: Schema.Types.ObjectId,
    ref: 'Transaction'
  }],

  // Investment Analysis Fields
  investment: {
    purchasePrice: Number,
    purchaseDate: Date,
    renovationCosts: Number,
    currentValue: Number,
    projectedRentalIncome: Number,
    actualRentalIncome: Number,
    expenses: {
      propertyTax: Number,
      insurance: Number,
      maintenance: Number,
      utilities: Number,
      management: Number,
      other: Number
    },
    capRate: Number, // Calculated
    cashFlow: Number, // Calculated
    roi: Number, // Calculated
    notes: String
  },

  // Listing Data (for properties on market)
  listing: {
    isListed: { type: Boolean, default: false },
    listPrice: Number,
    listDate: Date,
    daysOnMarket: Number,
    mlsNumber: String,
    priceHistory: [{
      price: Number,
      date: { type: Date, default: Date.now },
      reason: String
    }],
    showingInstructions: String,
    lockboxCode: String
  },

  // Property History
  history: [{
    event: {
      type: String,
      enum: ['listed', 'price_change', 'status_change', 'sold', 'rented', 'maintenance', 'inspection', 'other']
    },
    date: { type: Date, default: Date.now },
    description: String,
    amount: Number,
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }],

  // Houses
  houses: [{
    number: { type: String, required: true, trim: true },
    lastPayment: { type: Date },
    tenant: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['occupied', 'available', 'maintenance'], default: 'available' }
  }],

  // Current tenant information
  currentTenant: {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User' },
    leaseStart: Date,
    leaseEnd: Date,
    rentDueDate: { type: Number, min: 1, max: 31, default: 1 }
  },

  // Amenities and features
  amenities: [{
    type: String,
    enum: [
      'parking', 'security', 'wifi', 'gym', 'pool', 'garden',
      'balcony', 'elevator', 'backup_generator', 'water_tank',
      'cctv', 'playground', 'laundry', 'shopping_center'
    ]
  }],

  // Media
  images: [{
    url: { type: String, required: true },
    caption: String,
    isPrimary: { type: Boolean, default: false }
  }],
  videoTour: String,
  documents: [{
    type: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Legal Compliance
  compliance: {
    ratesPaid: Boolean,
    nemaApproved: Boolean,
    fireCertificate: Boolean
  },
  contractUrl: { type: String, match: [/^https?:\/\//, 'Please use a valid URL'] },

  // Verification and compliance
  verified: { type: Boolean, default: false },
  verifiedAt: Date,
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // Metadata
  views: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  listingDate: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
propertySchema.index({ 'address.coordinates': '2dsphere' });
propertySchema.index({ 'address.area': 1, status: 1 });
propertySchema.index({ 'address.city': 1, status: 1 });
propertySchema.index({ type: 1, status: 1 });
propertySchema.index({ landlord: 1, status: 1 });
propertySchema.index({ 'rent.amount': 1, status: 1 });
propertySchema.index({ featured: 1, listingDate: -1 });
propertySchema.index({ subcounty: 1, rent: 1 });
propertySchema.index({ title: 'text', description: 'text' });

// Virtual properties
propertySchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.area}, ${addr.city}, ${addr.county}${addr.postalCode ? ' ' + addr.postalCode : ''}`;
});

propertySchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : null);
});

propertySchema.virtual('rentDisplay').get(function() {
  return `${this.rent.currency} ${this.rent.amount.toLocaleString()}/${this.rent.paymentFrequency}`;
});

propertySchema.virtual('depositAmount').get(function() {
  return this.deposit || this.rent.amount * 2;
});

propertySchema.virtual('formattedRent').get(function() {
  return `KES ${this.rent.amount.toLocaleString('en-KE')}`;
});

propertySchema.virtual('coordinates').get(function() {
  return this.address.coordinates?.coordinates?.join(', ') || '';
});

// Instance methods
propertySchema.methods.getWaterStatus = function() {
  return this.waterSchedule && this.waterSchedule.size > 0 ? 'Rationed' : 'Available';
};

propertySchema.methods.linkContact = function(contactId, relationship, notes = '') {
  const existing = this.relatedContacts.find(
    rc => rc.contact.toString() === contactId.toString()
  );
  
  if (existing) {
    existing.relationship = relationship;
    existing.date = new Date();
    existing.notes = notes;
  } else {
    this.relatedContacts.push({
      contact: contactId,
      relationship,
      notes,
      date: new Date()
    });
  }
  
  return this.save();
};

propertySchema.methods.addToHistory = function(event, description, amount = null, performedBy = null) {
  this.history.push({
    event,
    description,
    amount,
    performedBy,
    date: new Date()
  });
  return this.save();
};

propertySchema.methods.calculateInvestmentMetrics = function() {
  if (!this.investment.purchasePrice) return this;
  
  const totalInvestment = this.investment.purchasePrice + (this.investment.renovationCosts || 0);
  const annualIncome = (this.investment.actualRentalIncome || this.investment.projectedRentalIncome || 0) * 12;
  const totalExpenses = Object.values(this.investment.expenses || {}).reduce((sum, val) => sum + (val || 0), 0);
  const noi = annualIncome - totalExpenses;
  
  this.investment.capRate = totalInvestment > 0 ? (noi / totalInvestment) * 100 : 0;
  this.investment.cashFlow = noi / 12;
  this.investment.roi = totalInvestment > 0 ? ((noi / totalInvestment) * 100) : 0;
  
  return this.save();
};

propertySchema.methods.updateListingPrice = function(newPrice, reason = '') {
  if (!this.listing.priceHistory) {
    this.listing.priceHistory = [];
  }
  
  this.listing.priceHistory.push({
    price: this.listing.listPrice,
    date: new Date(),
    reason
  });
  
  this.listing.listPrice = newPrice;
  
  this.addToHistory('price_change', `Price changed to ${newPrice}. Reason: ${reason}`, newPrice);
  
  return this.save();
};

propertySchema.methods.markAsOccupied = function(tenantId, leaseStart, leaseEnd, rentDueDate = 1) {
  this.status = 'occupied';
  this.isAvailable = false;
  this.currentTenant = { tenantId, leaseStart, leaseEnd, rentDueDate };
  return this.save();
};

propertySchema.methods.markAsAvailable = function() {
  this.status = 'available';
  this.isAvailable = true;
  this.currentTenant = {};
  return this.save();
};

propertySchema.methods.updateRent = function(newAmount) {
  this.rent.amount = newAmount;
  return this.save();
};

propertySchema.methods.addImage = function(imageUrl, caption = '', isPrimary = false) {
  if (isPrimary) {
    this.images.forEach(img => img.isPrimary = false);
  }
  this.images.push({ url: imageUrl, caption, isPrimary: isPrimary || this.images.length === 0 });
  return this.save();
};

propertySchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Middleware
propertySchema.pre('save', function(next) {
  if (this.images && this.images.length > 0) {
    let primaryCount = 0;
    this.images.forEach((img, index) => {
      if (img.isPrimary) {
        primaryCount++;
        if (primaryCount > 1) {
          img.isPrimary = false;
        }
      }
    });
    if (primaryCount === 0) {
      this.images[0].isPrimary = true;
    }
  }
  if (this.isModified('status')) {
    this.isAvailable = this.status === 'available';
  } else if (this.isModified('isAvailable')) {
    this.status = this.isAvailable ? 'available' : 'occupied';
  }
  next();
});

propertySchema.post('save', function(doc, next) {
  if (this.isNew) {
    mongoose.model('User').updateOne(
      { _id: doc.landlord },
      { $inc: { propertyCount: 1 } }
    ).exec();
  }
  next();
});

// Static methods
propertySchema.statics.findAvailable = function(filters = {}) {
  const query = { status: 'available', isAvailable: true };
  if (filters.city) query['address.city'] = new RegExp(filters.city, 'i');
  if (filters.area) query['address.area'] = new RegExp(filters.area, 'i');
  if (filters.type) query.type = filters.type;
  if (filters.minRent || filters.maxRent) {
    query['rent.amount'] = {};
    if (filters.minRent) query['rent.amount'].$gte = filters.minRent;
    if (filters.maxRent) query['rent.amount'].$lte = filters.maxRent;
  }
  if (filters.bedrooms) query.bedrooms = filters.bedrooms;
  if (filters.amenities && filters.amenities.length > 0) query.amenities = { $in: filters.amenities };
  return this.find(query).populate('landlord', 'name email phone').sort({ featured: -1, listingDate: -1 });
};

propertySchema.statics.findByLandlord = function(landlordId) {
  return this.find({ landlord: landlordId }).populate('currentTenant.tenantId', 'name email phone').sort({ createdAt: -1 });
};

propertySchema.statics.getAreaStats = async function() {
  const pipeline = [
    { $group: { _id: '$address.area', count: { $sum: 1 }, averageRent: { $avg: '$rent.amount' }, availableCount: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } } } },
    { $sort: { count: -1 } }
  ];
  return this.aggregate(pipeline);
};

propertySchema.statics.getRentStats = async function() {
  return this.aggregate([
    { $group: { _id: '$subcounty', averageRent: { $avg: '$rent.amount' }, minRent: { $min: '$rent.amount' }, maxRent: { $max: '$rent.amount' }, count: { $sum: 1 } } },
    { $sort: { averageRent: 1 } }
  ]);
};

module.exports = mongoose.model('Property', propertySchema);