const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const searchIndexSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['property', 'tenant', 'payment', 'maintenance', 'document']
  },
  documentId: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'type'
  },
  content: {
    type: String,
    required: true
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  },
  searchableFields: [{
    name: String,
    value: String,
    weight: Number
  }],
  tags: [String],
  status: {
    type: String,
    enum: ['pending', 'indexed', 'failed'],
    default: 'pending'
  },
  lastIndexed: Date,
  errorLog: [{
    timestamp: Date,
    error: String,
    details: Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
searchIndexSchema.index({ type: 1, documentId: 1 }, { unique: true });
searchIndexSchema.index({ content: 'text', 'searchableFields.value': 'text' });
searchIndexSchema.index({ tags: 1 });
searchIndexSchema.index({ status: 1 });

module.exports = mongoose.model('SearchIndex', searchIndexSchema);