const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'json', 'array'],
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'system',
      'email',
      'payment',
      'security',
      'notification',
      'feature_flags',
      'maintenance',
      'other'
    ]
  },
  description: {
    type: String,
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Version history schema
const configVersionSchema = new mongoose.Schema({
  configKey: {
    type: String,
    required: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Indexes
configVersionSchema.index({ configKey: 1, version: -1 });

const Config = mongoose.model('Config', configSchema);
const ConfigVersion = mongoose.model('ConfigVersion', configVersionSchema);

module.exports = { Config, ConfigVersion };