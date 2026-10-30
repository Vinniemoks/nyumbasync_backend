const mongoose = require('mongoose');

// An owner's invitation for a client to take one unit. Only the sha256 of the
// emailed token is stored. The lease terms, rules and agreement text are
// frozen here so the tenant signs exactly what the owner sent.
const TenantInviteSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },

  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  // House number within the property; absent for a single-unit property.
  unit: { type: String, trim: true },
  floor: { type: Number, min: 0, max: 100 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  phone: { type: String, required: true },

  terms: {
    rentAmount: { type: Number, required: true, min: 0 },
    depositAmount: { type: Number, required: true, min: 0 },
    durationMonths: { type: Number, required: true, min: 1, max: 60 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rentDueDate: { type: Number, default: 5, min: 1, max: 28 },
  },
  rules: [{ type: String, trim: true }],
  agreementSections: [{ _id: false, title: String, body: String }],

  // The owner signs by sending; the tenant signs on acceptance.
  landlordSignature: { fullName: String, signedAt: Date, ipAddress: String },

  status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true },
  emailSent: { type: Boolean, default: false },
  lastSentAt: Date,
  resendCount: { type: Number, default: 0 },

  acceptedAt: Date,
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lease: { type: mongoose.Schema.Types.ObjectId, ref: 'Lease' },
}, { timestamps: true });

module.exports = mongoose.models.TenantInvite || mongoose.model('TenantInvite', TenantInviteSchema);
