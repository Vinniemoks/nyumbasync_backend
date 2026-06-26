const mongoose = require('mongoose');
const { Schema } = mongoose;

const expenseSchema = new Schema({
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['maintenance', 'utilities', 'repairs', 'supplies', 'other']
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  receipt: {
    type: String, // URL or path to the receipt file
    required: false
  },
  recordedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'bank', 'cash', 'other'],
    required: false
  },
  paymentReference: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for better query performance
expenseSchema.index({ property: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ date: 1 });
expenseSchema.index({ status: 1 });

// Virtual for formatted date
expenseSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;