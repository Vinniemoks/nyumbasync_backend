const User = require('../models/user.model');
const { initiateSTKPush } = require('../services/mpesa.service');
const { generateJWT } = require('../utils/auth');
const { validatePhone } = require('../utils/kenyanValidators'); // Corrected import
const logger = require('../utils/logger');

// Enhanced Kenyan phone registration with M-Pesa verification
exports.registerWithPhone = async (req, res) => {
  try {
    const { phone, role = 'tenant' } = req.body;

    // Validate Kenyan phone format
    if (!validatePhone(phone)) { // Changed to validatePhone
      return res.status(400).json({ 
        error: 'Invalid Kenyan phone. Use 2547... or 2541... format',
        example: '254712345678'
      });
    }

    // Check if phone already registered
    const existingUser = await User.findOne({ phone });
    if (existingUser?.mpesaVerified) {
      return res.status(409).json({
        error: 'Phone number already registered',
        action: 'Login instead or use different number'
      });
    }

    // Generate 4-digit verification code
    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
    const amount = 1; // KES 1 for verification

    // Send STK push via M-Pesa
    await initiateSTKPush( // Changed from mpesaSTKPush
      phone, 
      amount,
      `NyumbaSync Verification: ${verificationCode}`
    );

    // Create/update user record
    const user = await User.findOneAndUpdate(
      { phone },
      { 
        phone,
        role,
        verificationCode,
        codeExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        mpesaVerified: false
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );

    logger.info(`Verification code sent to ${phone}`);

    res.status(202).json({
      success: true,
      message: 'MPesa payment request sent for verification',
      tempUserId: user._id,
      expiresIn: '10 minutes',
      notice: 'Enter the 4-digit code from your payment confirmation message'
    });

  } catch (err) {
    logger.error(`Registration error for ${req.body.phone}: ${err.message}`);
    
    res.status(500).json({ 
      error: 'Kuna tatuko kwenye usajili',
      actions: [
        'Tafadhali jaribu tena baada ya dakika chache',
        'Piga *544# kwa msaada wa M-Pesa'
      ],
      contact: '0700NYUMBA'
    });
  }
};

// Enhanced code verification with JWT issuance
exports.verifyCode = async (req, res) => { // Changed to exports.verifyCode
  try {
    const { phone, code } = req.body;

    // Find unexpired code record
    const user = await User.findOne({
      phone,
      codeExpires: { $gt: new Date() }
    });

    if (!user || user.verificationCode !== code) {
      return res.status(400).json({ 
        error: 'Namba ya uthibitisho si sahihi au imeisha',
        solutions: [
          'Hakikisha umeingiza namba kwa usahihi',
          'Omba namba mpya kupitia M-Pesa'
        ]
      });
    }

    // Mark as verified
    user.mpesaVerified = true;
    user.verificationCode = undefined;
    user.codeExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = generateJWT({
      id: user._id,
      phone: user.phone,
      role: user.role
    });

    logger.info(`User ${phone} successfully verified`);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        role: user.role,
        kraPin: user.kraPin || null,
        phone: user.phone
      },
      mpesaVerified: true
    });

  } catch (err) {
    logger.error(`Verification error for ${req.body.phone}: ${err.message}`);
    
    res.status(500).json({
      error: 'Samahani, kuna tatuko kwenye uthibitisho',
      immediateActions: [
        'Jaribu tena baada ya dakika chache',
        'Wasiliana na 0700NYUMBA kwa msaada'
      ]
    });
  }
};

// User profile endpoint
exports.getProfile = async (req, res) => {
  try {
    // Get user details from database (excluding sensitive info)
    const user = await User.findById(req.user._id)
      .select('-password -verificationCode -codeExpires -resetToken -resetTokenExpiry')
      .lean();

    if (!user) {
      return res.status(404).json({ 
        error: 'User profile not found',
        solution: 'Try logging in again'
      });
    }

    // Format profile response
    const profile = {
      id: user._id,
      phone: user.phone,
      role: user.role,
      isVerified: user.mpesaVerified,
      profileComplete: user.profileComplete || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Add role-specific fields
    if (user.role === 'landlord') {
      profile.kraPin = user.kraPin || null;
      profile.propertiesCount = user.properties?.length || 0;
    } else if (user.role === 'tenant') {
      profile.leasesCount = user.leases?.length || 0;
    }

    logger.info(`Profile accessed for user ${user._id}`);
    res.status(200).json(profile);

  } catch (error) {
    logger.error(`Profile error for user ${req.user?._id}: ${error.message}`);
    res.status(500).json({
      error: 'Failed to fetch profile',
      contact: '0700NYUMBA for assistance'
    });
  }
};

// Additional authentication methods
exports.requestNewCode = async (req, res) => {
  // Implementation for requesting new verification code
};

exports.validateKRA = async (req, res) => {
  // KRA validation for landlords
};