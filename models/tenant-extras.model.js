/**
 * Models backing the tenant community / guests / utilities / emergency
 * features. Kept lightweight on purpose — extend as the features grow.
 */

const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const bulletinPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    category: { type: String, enum: ['general', 'marketplace', 'events', 'lost-found'], default: 'general' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
  },
  { timestamps: true }
);

const guestSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    guestName: { type: String, required: true, trim: true },
    guestPhone: { type: String, trim: true },
    expectedDate: Date,
    accessCode: String,
    status: { type: String, enum: ['expected', 'arrived', 'departed', 'cancelled'], default: 'expected' },
    arrivedAt: Date,
  },
  { timestamps: true }
);

const utilityBillSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    type: { type: String, enum: ['water', 'electricity', 'gas', 'internet', 'garbage', 'other'], required: true },
    amount: { type: Number, required: true },
    period: String, // e.g. "2026-06"
    usage: Number,
    unit: String, // e.g. kWh, m3
    dueDate: Date,
    status: { type: String, enum: ['due', 'paid', 'overdue'], default: 'due' },
  },
  { timestamps: true }
);

const issueReportSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    title: { type: String, required: true, trim: true },
    description: String,
    area: { type: String, enum: ['unit', 'common-area'], default: 'unit' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

const emergencyReportSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    emergencyType: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'high' },
    description: String,
    location: String,
    status: { type: String, enum: ['reported', 'responding', 'resolved'], default: 'reported' },
  },
  { timestamps: true }
);

const leaseRenewalRequestSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lease: { type: mongoose.Schema.Types.ObjectId, ref: 'Lease' },
    requestedTermMonths: { type: Number, default: 12 },
    notes: String,
    status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = {
  Announcement: mongoose.model('Announcement', announcementSchema),
  BulletinPost: mongoose.model('BulletinPost', bulletinPostSchema),
  Guest: mongoose.model('Guest', guestSchema),
  UtilityBill: mongoose.model('UtilityBill', utilityBillSchema),
  IssueReport: mongoose.model('IssueReport', issueReportSchema),
  EmergencyReport: mongoose.model('EmergencyReport', emergencyReportSchema),
  LeaseRenewalRequest: mongoose.model('LeaseRenewalRequest', leaseRenewalRequestSchema),
};
