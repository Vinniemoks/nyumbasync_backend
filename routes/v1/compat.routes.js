/**
 * Contract-gap routes.
 *
 * Implements the endpoints that the web/mobile/desktop clients call but no
 * existing route module provides: the /tenant community/guests/utilities/
 * emergency features, the /tenants admin collection, /rent-payments and
 * /reports aliases, and the admin emergency broadcast.
 *
 * Mounted at the v1 root AFTER the specific routers, so it only handles
 * paths the dedicated modules don't.
 */

const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();

const { authenticate } = require('../../middlewares/auth.middleware');
const Tenant = require('../../models/tenant.model');
const Lease = require('../../models/lease.model');
const Notification = require('../../models/notification.model');
const paymentController = require('../../controllers/payment.controller');
const {
  Announcement,
  BulletinPost,
  Guest,
  UtilityBill,
  IssueReport,
  EmergencyReport,
  LeaseRenewalRequest,
} = require('../../models/tenant-extras.model');

const generateAccessCode = () => String(Math.floor(100000 + Math.random() * 900000));

/* ------------------------------------------------------------------ */
/* Tenant community                                                     */
/* ------------------------------------------------------------------ */

router.get('/tenant/announcements', authenticate('tenant'), asyncHandler(async (req, res) => {
  const announcements = await Announcement.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, announcements });
}));

router.put('/tenant/announcements/:id/read', authenticate('tenant'), asyncHandler(async (req, res) => {
  await Announcement.findByIdAndUpdate(req.params.id, { $addToSet: { readBy: req.user._id } });
  res.json({ success: true });
}));

router.get('/tenant/bulletin', authenticate('tenant'), asyncHandler(async (req, res) => {
  const posts = await BulletinPost.find({}).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, posts });
}));

router.post('/tenant/bulletin', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'title and content are required' });
  }
  const post = await BulletinPost.create({
    title,
    content,
    category,
    author: req.user._id,
    authorName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
  });
  res.status(201).json({ success: true, post });
}));

/* ------------------------------------------------------------------ */
/* Guests                                                               */
/* ------------------------------------------------------------------ */

router.get('/tenant/guests', authenticate('tenant'), asyncHandler(async (req, res) => {
  const guests = await Guest.find({ tenant: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, guests });
}));

router.post('/tenant/guests', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { guestName, guestPhone, expectedDate } = req.body;
  if (!guestName) {
    return res.status(400).json({ success: false, message: 'guestName is required' });
  }
  const guest = await Guest.create({
    tenant: req.user._id,
    guestName,
    guestPhone,
    expectedDate,
    accessCode: generateAccessCode(),
  });
  res.status(201).json({ success: true, guest });
}));

router.put('/tenant/guests/:id/arrived', authenticate('tenant'), asyncHandler(async (req, res) => {
  const guest = await Guest.findOneAndUpdate(
    { _id: req.params.id, tenant: req.user._id },
    { status: 'arrived', arrivedAt: new Date() },
    { new: true }
  );
  if (!guest) return res.status(404).json({ success: false, message: 'Guest not found' });
  res.json({ success: true, guest });
}));

router.delete('/tenant/guests/:id', authenticate('tenant'), asyncHandler(async (req, res) => {
  await Guest.findOneAndUpdate({ _id: req.params.id, tenant: req.user._id }, { status: 'cancelled' });
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Utilities                                                            */
/* ------------------------------------------------------------------ */

router.get('/tenant/utilities', authenticate('tenant'), asyncHandler(async (req, res) => {
  const bills = await UtilityBill.find({ tenant: req.user._id }).sort({ dueDate: -1 }).lean();
  res.json({ success: true, bills });
}));

router.get('/tenant/utilities/trends', authenticate('tenant'), asyncHandler(async (req, res) => {
  const trends = await UtilityBill.aggregate([
    { $match: { tenant: req.user._id } },
    { $group: { _id: { period: '$period', type: '$type' }, total: { $sum: '$amount' }, usage: { $sum: '$usage' } } },
    { $sort: { '_id.period': 1 } },
  ]);
  res.json({ success: true, trends });
}));

/* ------------------------------------------------------------------ */
/* Issues                                                               */
/* ------------------------------------------------------------------ */

router.get('/tenant/issues', authenticate('tenant'), asyncHandler(async (req, res) => {
  const issues = await IssueReport.find({ tenant: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, issues });
}));

router.post('/tenant/issues', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'title is required' });
  const issue = await IssueReport.create({ tenant: req.user._id, title, description, area: 'unit' });
  res.status(201).json({ success: true, issue });
}));

router.post('/tenant/issues/common-area', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'title is required' });
  const issue = await IssueReport.create({ tenant: req.user._id, title, description, area: 'common-area' });
  res.status(201).json({ success: true, issue });
}));

/* ------------------------------------------------------------------ */
/* Emergency                                                            */
/* ------------------------------------------------------------------ */

router.get('/tenant/emergency/contacts', authenticate('tenant'), asyncHandler(async (req, res) => {
  // Static defaults; property-specific contacts can be layered in later.
  res.json({
    success: true,
    contacts: [
      { name: 'Police', phone: '999', type: 'police' },
      { name: 'Fire Brigade', phone: '999', type: 'fire' },
      { name: 'Ambulance (St John)', phone: '+254 20 2210000', type: 'medical' },
      { name: 'Building Management', phone: process.env.EMERGENCY_MGMT_PHONE || '+254 700 000 000', type: 'management' },
    ],
  });
}));

router.get('/tenant/emergency/alerts', authenticate('tenant'), asyncHandler(async (req, res) => {
  const alerts = await EmergencyReport.find({ status: { $ne: 'resolved' } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ success: true, alerts });
}));

router.post('/tenant/emergency/report', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { emergencyType, severity, description, location } = req.body;
  if (!emergencyType) {
    return res.status(400).json({ success: false, message: 'emergencyType is required' });
  }
  const report = await EmergencyReport.create({
    tenant: req.user._id,
    emergencyType,
    severity,
    description,
    location,
  });

  // Best-effort real-time broadcast; ignore failures.
  try {
    const { broadcast } = require('../../websocket/server');
    broadcast('emergency_alert', { id: report._id, emergencyType, severity, location });
  } catch { /* websocket not available */ }

  res.status(201).json({ success: true, report });
}));

/* ------------------------------------------------------------------ */
/* Lease renewal                                                        */
/* ------------------------------------------------------------------ */

router.post('/tenant/lease/renew', authenticate('tenant'), asyncHandler(async (req, res) => {
  const { requestedTermMonths, notes } = req.body;
  const lease = await Lease.findOne({ tenant: req.user._id }).sort({ createdAt: -1 });
  const request = await LeaseRenewalRequest.create({
    tenant: req.user._id,
    lease: lease?._id,
    requestedTermMonths,
    notes,
  });
  res.status(201).json({ success: true, request });
}));

/* ------------------------------------------------------------------ */
/* Rent payments alias                                                  */
/* ------------------------------------------------------------------ */

router.get('/rent-payments', authenticate(), asyncHandler(paymentController.paymentHistory));
router.post('/rent-payments', authenticate('tenant'), asyncHandler(paymentController.payRent));

/* ------------------------------------------------------------------ */
/* Tenants collection (landlord/manager/admin)                          */
/* ------------------------------------------------------------------ */

const staffOnly = authenticate(['landlord', 'manager', 'agent', 'admin', 'super_admin']);

router.get('/tenants', staffOnly, asyncHandler(async (req, res) => {
  const { propertyId, status, page = 1, limit = 50 } = req.query;
  const query = {};
  if (propertyId) query.property = propertyId;
  if (status) query.status = status;
  const tenants = await Tenant.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  const total = await Tenant.countDocuments(query);
  res.json({ success: true, tenants, total, page: Number(page) });
}));

router.get('/tenants/:id', staffOnly, asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
  res.json({ success: true, tenant });
}));

router.post('/tenants', staffOnly, asyncHandler(async (req, res) => {
  const tenant = await Tenant.create(req.body);
  res.status(201).json({ success: true, tenant });
}));

router.put('/tenants/:id', staffOnly, asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
  res.json({ success: true, tenant });
}));

router.delete('/tenants/:id', staffOnly, asyncHandler(async (req, res) => {
  await Tenant.findByIdAndDelete(req.params.id);
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Reports aliases                                                      */
/* ------------------------------------------------------------------ */

router.get('/reports/financial', authenticate(['landlord', 'manager', 'admin', 'super_admin']), asyncHandler(async (req, res) => {
  const reportsService = require('../../services/reportsService');
  const data = await reportsService.generateIncomeStatement({
    landlordId: req.user._id,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });
  res.json({ success: true, report: data });
}));

router.get('/reports/occupancy', authenticate(['landlord', 'manager', 'admin', 'super_admin']), asyncHandler(async (req, res) => {
  const reportsService = require('../../services/reportsService');
  const data = await reportsService.generatePropertyPerformance({
    landlordId: req.user._id,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });
  res.json({ success: true, report: data });
}));

/* ------------------------------------------------------------------ */
/* Admin emergency broadcast                                            */
/* ------------------------------------------------------------------ */

router.post('/admin/emergency/alert', authenticate(['admin', 'super_admin', 'landlord', 'manager']), asyncHandler(async (req, res) => {
  const { title, message, severity = 'urgent' } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'title and message are required' });
  }

  const notification = await Notification.create({
    title,
    message,
    type: 'emergency_alert',
    priority: severity,
    audience: 'all',
  }).catch(() => null); // schema differences shouldn't block the broadcast

  try {
    const { broadcast } = require('../../websocket/server');
    broadcast('emergency_alert', { title, message, severity });
  } catch { /* websocket not available */ }

  res.status(201).json({ success: true, notification });
}));

module.exports = router;
