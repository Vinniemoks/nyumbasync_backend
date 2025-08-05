const User = require('../models/user.model');
const Lease = require('../models/lease.model'); 
const { sendSMS } = require('../services/sms.service');
const { generateAuthToken } = require('../services/auth.service');
const { logUserActivity } = require('../../utils/logger');
const { formatPhoneForMPesa } = require('../../utils/formatters');

/**
 * Get current user's profile
 */
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -verificationCode -resetToken')
      .populate('currentProperty', 'name location rentAmount')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add lease information if tenant
    if (user.role === 'tenant') {
      const lease = await Lease.findOne({ 
        tenant: user._id,
        status: 'active'
      }).select('startDate endDate terms');
      
      user.leaseInfo = lease || null;
    }

    res.json(user);

  } catch (error) {
    logUserActivity(req.user._id, 'PROFILE_FETCH_FAILED', error.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['name', 'email', 'idNumber', 'kraPin', 'avatar'];

    // Filter only allowed updates
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

  } catch (error) {
    logUserActivity(req.user._id, 'PROFILE_UPDATE_FAILED', error.message);
    res.status(400).json({ 
      error: 'Profile update failed',
      details: error.message
    });
  }
};

/**
 * Initiate phone verification (for M-Pesa integration)
 */
exports.initiatePhoneVerification = async (req, res) => {
  try {
    const { phone } = req.body;
    const formattedPhone = formatPhoneForMPesa(phone);

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Save code to user (expires in 10 mins)
    await User.findByIdAndUpdate(req.user._id, {
      phone: formattedPhone,
      verificationCode,
      verificationCodeExpiry: Date.now() + 600000 // 10 minutes
    });

    // Send SMS via Africa's Talking or similar service
    await sendSMS({
      to: formattedPhone,
      message: `Your NyumbaSync verification code is ${verificationCode}. Expires in 10 minutes.`
    });

    logUserActivity(req.user._id, 'VERIFICATION_INITIATED');
    res.json({ message: 'Verification code sent' });

  } catch (error) {
    logUserActivity(req.user._id, 'VERIFICATION_FAILED', error.message);
    res.status(500).json({ error: 'Failed to initiate verification' });
  }
};

/**
 * Confirm verification code
 */
exports.confirmVerificationCode = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({
      _id: req.user._id,
      verificationCode: code,
      verificationCodeExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark phone as verified
    user.mpesaVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    await user.save();

    // Generate new token with verified status
    const token = generateAuthToken(user);

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

  } catch (error) {
    logUserActivity(req.user._id, 'VERIFICATION_CONFIRM_FAILED', error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
};

/**
 * List all users (Admin only)
 */
exports.listUsers = async (req, res) => {
  try {
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

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Get user by ID (Admin only)
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -verificationCode')
      .populate('currentProperty', 'name location')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

/**
 * Update user status (Admin only)
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'inactive'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Notify user if status changed
    if (status === 'suspended') {
      await sendSMS({
        to: user.phone,
        message: 'Your NyumbaSync account has been suspended. Contact support for assistance.'
      });
    }

    logUserActivity(req.user._id, 'USER_STATUS_UPDATED', { userId: user._id, status });
    res.json(user);

  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

/**
 * Complete user profile (for first-time setup)
 */
exports.completeProfile = async (req, res) => {
  try {
    const { name, idNumber, kraPin } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        name,
        idNumber,
        kraPin,
        profileComplete: true 
      },
      { new: true }
    ).select('-password -verificationCode');

    // Generate new token with updated profile status
    const token = generateAuthToken(user);

    res.json({ 
      message: 'Profile completed successfully',
      token,
      user 
    });

  } catch (error) {
    res.status(400).json({ 
      error: 'Profile completion failed',
      details: error.message 
    });
  }
};