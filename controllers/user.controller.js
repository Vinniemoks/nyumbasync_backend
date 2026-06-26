// C:\Users\USER\NyumbaSync\nyumbasync_backend\controllers\user.controller.js
const User = require('../models/user.model');
const Property = require('../models/property.model');
const smsService = require('../services/sms.service');
const { generateAuthToken } = require('../services/auth.service');
const { logUserActivity } = require('../utils/logger');
const { formatPhoneForMPesa } = require('../utils/formatters');
const asyncHandler = require('express-async-handler');

exports.getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -verificationCode -resetToken')
    .lean();
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.role === 'tenant') {
    const properties = await Property.find({ 'houses.tenant': user._id })
      .select('title address rent houses');
    user.leaseInfo = properties.flatMap(p => p.houses
      .filter(h => h.tenant && h.tenant.toString() === user._id.toString())
      .map(h => ({
        propertyId: p._id,
        propertyTitle: p.title,
        houseNumber: h.number,
        leaseStart: p.currentTenant?.leaseStart,
        leaseEnd: p.currentTenant?.leaseEnd,
        rentDueDate: p.currentTenant?.rentDueDate
      })));
  }
  res.json(user);
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const updates = req.body;
  const allowedUpdates = ['name', 'email', 'idNumber', 'kraPin', 'avatar'];
  const validUpdates = Object.keys(updates).reduce((acc, key) => {
    if (allowedUpdates.includes(key)) {
      acc[key] = updates[key];
    }
    return acc;
  }, {});
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: validUpdates },
    { new: true, runValidators: true }
  ).select('-password -verificationCode');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  logUserActivity(user._id, 'PROFILE_UPDATED');
  res.json(user);
});

exports.initiatePhoneVerification = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const formattedPhone = formatPhoneForMPesa(phone);
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const user = await User.findByIdAndUpdate(req.user._id, {
    phone: formattedPhone,
    verificationCode,
    verificationCodeExpiry: Date.now() + 600000
  }, { new: true });
  await smsService.sendSMS({
    phoneNumber: formattedPhone,
    message: `Your NyumbaSync verification code is ${verificationCode}. Expires in 10 minutes.`
  });
  logUserActivity(req.user._id, 'VERIFICATION_INITIATED');
  res.json({ message: 'Verification code sent' });
});

exports.confirmVerificationCode = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const user = await User.findOne({
    _id: req.user._id,
    verificationCode: code,
    verificationCodeExpiry: { $gt: Date.now() }
  });
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  user.mpesaVerified = true;
  user.verificationCode = undefined;
  user.verificationCodeExpiry = undefined;
  await user.save();
  const token = generateAuthToken(user);
  await smsService.sendSMS({
    phoneNumber: user.phone,
    message: 'Your NyumbaSync phone verification is complete. You can now use M-Pesa payments.'
  });
  logUserActivity(user._id, 'PHONE_VERIFIED');
  res.json({ 
    message: 'Phone number verified', 
    token,
    user: {
      _id: user._id,
      phone: user.phone,
      role: user.role,
      mpesaVerified: true
    }
  });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { role, verified, search } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const query = {};
  if (role) query.role = role;
  if (verified) query.mpesaVerified = verified === 'true';
  if (search) {
    query.$or = [
      { phone: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } }
    ];
  }
  const users = await User.find(query)
    .select('-password -verificationCode')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const count = await User.countDocuments(query);
  res.json({
    count,
    page,
    totalPages: Math.ceil(count / limit),
    users
  });
});

exports.getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -verificationCode')
    .lean();
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.role === 'tenant') {
    const properties = await Property.find({ 'houses.tenant': user._id })
      .select('title address');
    user.properties = properties;
  }
  res.json(user);
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['active', 'suspended', 'inactive'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  ).select('-password');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (status === 'suspended') {
    await smsService.sendSMS({
      phoneNumber: user.phone,
      message: 'Your NyumbaSync account has been suspended. Contact support for assistance.'
    });
  } else if (status === 'active' && user.status === 'suspended') {
    await smsService.sendSMS({
      phoneNumber: user.phone,
      message: 'Your NyumbaSync account has been reactivated. You can now access all features.'
    });
  }
  logUserActivity(req.user._id, 'USER_STATUS_UPDATED', { userId: user._id, status });
  res.json(user);
});

exports.completeProfile = asyncHandler(async (req, res) => {
  const { name, idNumber, kraPin } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, idNumber, kraPin, profileComplete: true },
    { new: true }
  ).select('-password -verificationCode');
  if (!user.profileComplete) {
    await smsService.sendSMS({
      phoneNumber: user.phone,
      message: `Welcome to NyumbaSync, ${name}! Your profile setup is complete.`
    });
  }
  const token = generateAuthToken(user);
  res.json({ message: 'Profile completed successfully', token, user });
});

exports.getUserProperties = asyncHandler(async (req, res) => {
  const properties = await Property.findByLandlord(req.user._id);
  res.json({ count: properties.length, properties });
});

exports.getUserHouses = asyncHandler(async (req, res) => {
  const properties = await Property.find({ 'houses.tenant': req.user._id });
  const houses = properties.flatMap(p => p.houses
    .filter(h => h.tenant && h.tenant.toString() === req.user._id.toString())
    .map(h => ({
      propertyId: p._id,
      propertyTitle: p.title,
      houseNumber: h.number,
      status: h.status,
      lastPayment: h.lastPayment
    })));
  res.json({ count: houses.length, houses });
});