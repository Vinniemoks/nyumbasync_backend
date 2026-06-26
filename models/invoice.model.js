const mongoose = require('mongoose');
const { Schema } = mongoose;

// Whole-shilling rounding, mirroring payment.model.js
const roundKES = v => (v == null ? v : Math.round(v));

const LineItemSchema = new Schema({
  description: {
    type: String,
    required: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  accountingCode: {
    type: String,
    enum: ['RENT', 'DEPOSIT', 'UTILITY', 'PENALTY', 'OTHER'],
    default: 'RENT'
  },
  // Amount may be negative (e.g. a credit carried forward). For metered water
  // it is computed from the readings below in the invoice pre('validate') hook.
  amount: {
    type: Number,
    required: true,
    get: roundKES,
    set: roundKES
  },
  // Metered utility fields (water): amount = (meterCurrent - meterPrevious) * rate.
  meterPrevious: { type: Number, min: 0 },
  meterCurrent: { type: Number, min: 0 },
  rate: { type: Number, min: 0 },
  unit: { type: String, default: 'm³' }
}, { _id: false });

const InvoiceSchema = new Schema({
  // Financial Tracking
  invoiceNumber: {
    type: String,
    unique: true,
    default: function() {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const tail = this.property ? this.property.toString().slice(-4) : '0000';
      return `INV-${new Date().getFullYear()}-${rand}-${tail}`;
    }
  },

  // Parties
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Tenant reference is required']
  },
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Landlord reference is required']
  },
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },
  lease: {
    type: Schema.Types.ObjectId,
    ref: 'Lease',
    required: [true, 'Lease reference is required']
  },

  // Charges
  lineItems: {
    type: [LineItemSchema],
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: 'An invoice must have at least one line item'
    }
  },
  subtotal: { type: Number, default: 0, get: roundKES, set: roundKES },
  lateFee: { type: Number, default: 0, get: roundKES, set: roundKES },
  total: { type: Number, default: 0, get: roundKES, set: roundKES },
  // Running total paid against this invoice (supports partial payments and
  // carry-forward). balance = total - amountPaid.
  amountPaid: { type: Number, default: 0, get: roundKES, set: roundKES },
  currency: {
    type: String,
    default: 'KES',
    enum: { values: ['KES'], message: 'Only Kenyan Shillings (KES) are accepted' }
  },

  // Billing period this invoice covers
  periodCovered: {
    from: { type: Date, required: true },
    to: { type: Date, required: true }
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },

  // Lifecycle
  status: {
    type: String,
    enum: {
      values: ['draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void'],
      message: 'Invalid invoice status'
    },
    default: 'issued'
  },
  payment: {
    type: Schema.Types.ObjectId,
    ref: 'Payment'
  },
  lateFeeApplied: {
    type: Boolean,
    default: false
  },
  // Delivery tracking so the daily job doesn't re-notify every run.
  reminderSentAt: Date,
  overdueNoticeSentAt: Date,
  issuedAt: { type: Date, default: Date.now },
  paidAt: Date
}, {
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// ========================
// INDEXES
// ========================
InvoiceSchema.index({ tenant: 1, createdAt: -1 });
InvoiceSchema.index({ landlord: 1, createdAt: -1 });
InvoiceSchema.index({ property: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });
// One invoice per lease per billing month
InvoiceSchema.index({ lease: 1, 'periodCovered.from': 1 }, { unique: true });

// ========================
// VIRTUALS
// ========================
InvoiceSchema.virtual('formattedTotal').get(function() {
  return `KES ${this.total?.toLocaleString('en-KE')}`;
});

InvoiceSchema.virtual('isPaid').get(function() {
  return this.status === 'paid';
});

InvoiceSchema.virtual('periodLabel').get(function() {
  if (!this.periodCovered?.from) return null;
  return this.periodCovered.from.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
});

InvoiceSchema.virtual('balance').get(function() {
  return roundKES((this.total || 0) - (this.amountPaid || 0));
});

// ========================
// MIDDLEWARE
// ========================
// Compute metered (water) line amounts BEFORE validation, so the required
// `amount` is set when the landlord supplies only readings + rate.
InvoiceSchema.pre('validate', function(next) {
  if (Array.isArray(this.lineItems)) {
    for (const li of this.lineItems) {
      if (li.meterCurrent != null && li.rate != null) {
        const used = Math.max(0, (li.meterCurrent || 0) - (li.meterPrevious || 0));
        li.amount = used * li.rate;
      }
    }
  }
  next();
});

// Keep subtotal/total consistent with line items.
InvoiceSchema.pre('save', function(next) {
  if (Array.isArray(this.lineItems) && this.lineItems.length) {
    const penalty = this.lineItems
      .filter(li => li.accountingCode === 'PENALTY')
      .reduce((sum, li) => sum + (li.amount || 0), 0);
    const charges = this.lineItems
      .filter(li => li.accountingCode !== 'PENALTY')
      .reduce((sum, li) => sum + (li.amount || 0), 0);
    this.subtotal = charges;
    this.lateFee = penalty;
    this.total = charges + penalty;
  }
  next();
});

// ========================
// STATICS
// ========================

// Compute the billing window (first..last day) and due date for a lease
// in the month containing `refDate`.
InvoiceSchema.statics.periodForDate = function(lease, refDate = new Date()) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0); // last day of month
  const dueDay = Math.min(lease?.terms?.rentDueDate || 1, to.getDate());
  const dueDate = new Date(year, month, dueDay);
  return { from, to, dueDate };
};

// Idempotently create the invoice for a lease's billing month. Returns
// { invoice, created } so callers can report created vs. skipped counts.
InvoiceSchema.statics.generateForLease = async function(lease, refDate = new Date()) {
  const { from, to, dueDate } = this.periodForDate(lease, refDate);

  const existing = await this.findOne({ lease: lease._id, 'periodCovered.from': from });
  if (existing) {
    return { invoice: existing, created: false };
  }

  const rentAmount = lease.terms?.rentAmount || 0;
  const monthLabel = from.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });

  const lineItems = [
    { description: `Rent for ${monthLabel}`, accountingCode: 'RENT', amount: rentAmount }
  ];

  // Carry forward any unpaid balance (arrears) or credit (overpayment) from the
  // most recent real (non-draft) invoice on this lease.
  const prior = await this.findOne({
    lease: lease._id,
    'periodCovered.from': { $lt: from },
    status: { $nin: ['draft', 'void'] }
  }).sort({ 'periodCovered.from': -1 });

  if (prior) {
    const bal = (prior.total || 0) - (prior.amountPaid || 0);
    if (bal >= 1) {
      lineItems.push({ description: `Balance brought forward (${prior.invoiceNumber})`, accountingCode: 'OTHER', amount: bal });
    } else if (bal <= -1) {
      lineItems.push({ description: `Credit from last month (${prior.invoiceNumber})`, accountingCode: 'OTHER', amount: bal });
    }
  }

  // Created as a DRAFT — the landlord/agent adds water + service levies, then issues it.
  const invoice = await this.create({
    tenant: lease.tenant,
    landlord: lease.landlord,
    property: lease.property,
    lease: lease._id,
    lineItems,
    periodCovered: { from, to },
    dueDate,
    status: 'draft'
  });

  return { invoice, created: true };
};

// The current water meter reading from the latest invoice on a lease, used to
// prefill next month's "previous reading".
InvoiceSchema.statics.lastWaterReading = async function(leaseId) {
  const inv = await this.findOne({
    lease: leaseId,
    'lineItems.meterCurrent': { $exists: true }
  }).sort({ 'periodCovered.from': -1 });
  if (!inv) return 0;
  const water = inv.lineItems.find(li => li.meterCurrent != null);
  return water?.meterCurrent || 0;
};

// Issued/sent invoices whose due date has passed and that are not yet paid.
InvoiceSchema.statics.findOverdue = function(refDate = new Date()) {
  return this.find({
    status: { $in: ['issued', 'sent', 'partially_paid'] },
    dueDate: { $lt: refDate }
  });
};

module.exports = mongoose.model('Invoice', InvoiceSchema);
