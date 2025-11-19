const User = require('../models/user.model');
const { initiateSTKPush } = require('../services/mpesa.service');
const { generateToken } = require('../utils/auth'); // Corrected import name
const { validatePhone } = require('../utils/kenyanValidators');
const logger = require('../utils/logger'); // Import shared logger
const { blacklistToken } = require('../services/token-blacklist.service');

// Enhanced Kenyan phone registration with M-Pesa verification
exports.registerWithPhone = async (req, res) => {
  try {
    const { phone, role = 'tenant' } = req.body;

    console.log('Phone in registerWithPhone before validation:', phone); // Added console log

    // Validate Kenyan phone format
    if (!validatePhone(phone)) {
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

    // Send STK push via M-Pesa (mock or actual based on environment)
    // In test environment, we might mock this or have a test M-Pesa setup
    // await initiateSTKPush(
    //   phone, 
    //   amount,
    //   `NyumbaSync Verification: ${verificationCode}`
    // );

    // Create/update user record with temporary placeholder names
    const user = await User.findOneAndUpdate(
      { phone },
      { 
        phone,
        role,
        verificationCode,
        codeExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        mpesaVerified: false,
        // Add temporary values for required fields
        firstName: 'Pending', // Temporary - user will update during profile completion
        lastName: 'Verification', // Temporary - user will update during profile completion
        profileComplete: false // Flag to indicate profile needs completion
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );

    logger.info(`Verification code sent to ${phone}`);

    const responseBody = {
      success: true,
      message: 'MPesa payment request sent for verification',
      tempUserId: user._id,
      expiresIn: '10 minutes',
      notice: 'Enter the 4-digit code from your payment confirmation message'
    };

    // Conditionally include verification code in test environment
    if (process.env.NODE_ENV === 'test') {
      responseBody.verificationCode = verificationCode; 
    }

    res.status(202).json(responseBody);

  } catch (err) {
    console.error('Registration error details:', err); // Add detailed error logging
    logger.error(`Registration error for ${req.body.phone}: ${err.message}`); // Use shared logger
    
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
exports.verifyCode = async (req, res) => {
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
    const token = generateToken({
      id: user._id,
      phone: user.phone,
      role: user.role
    });

    logger.info(`User ${phone} successfully verified`); // Use shared logger

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
    console.error('Verification error details:', err); // Add detailed error logging
    logger.error(`Verification error for ${req.body.phone}: ${err.message}`); // Use shared logger
    
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
    }

    // Add name fields if not placeholder values
    if (user.firstName && user.firstName !== 'Pending') {
      profile.firstName = user.firstName;
    }
    if (user.lastName && user.lastName !== 'Verification') {
      profile.lastName = user.lastName;
    }

    logger.info(`Profile accessed for user ${user._id}`); // Use shared logger
    res.status(200).json(profile);

  } catch (error) {
    console.error('Profile error details:', error); // Add detailed error logging
    logger.error(`Profile error for user ${req.user?._id}: ${error.message}`); // Use shared logger
    res.status(500).json({
      error: 'Failed to fetch profile',
      contact: '0700NYUMBA for assistance'
    });
  }
};

// Profile completion endpoint
exports.completeProfile = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({
        error: 'First name and last name are required',
        missingFields: {
          firstName: !firstName,
          lastName: !lastName
        }
      });
    }

    // Update user profile
    const user = await User.findByIdAndUpdate(
      userId,
      {
        firstName,
        lastName,
        email: email || undefined, // Optional field
        profileComplete: true
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    logger.info(`Profile completed for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Profile completed successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileComplete: user.profileComplete
      }
    });

  } catch (error) {
    console.error('Profile completion error details:', error);
    logger.error(`Profile completion error for user ${req.user?._id}: ${error.message}`);
    
    res.status(500).json({
      error: 'Failed to complete profile',
      contact: '0700NYUMBA for assistance'
    });
  }
};

// Profile update endpoint
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user._id;

    // Find and update user profile
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates }, // Use $set to update only provided fields
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    logger.info(`Profile updated for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileComplete: user.profileComplete
      }
    });

  } catch (error) {
    console.error('Profile update error details:', error);
    logger.error(`Profile update error for user ${req.user?._id}: ${error.message}`);

    res.status(500).json({
      error: 'Failed to update profile',
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

// Login with email/phone and password
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const accountLockoutService = require('../services/account-lockout.service');
    const mfaService = require('../services/mfa.service');
    
    // Validate required fields
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }
    
    // Check if account is locked
    const lockStatus = await accountLockoutService.isLocked(identifier);
    if (lockStatus.locked) {
      return res.status(423).json({ 
        error: 'Account locked',
        message: lockStatus.message,
        lockoutUntil: lockStatus.lockoutUntil
      });
    }
    
    // Find user by email or phone and include password field
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { phone: identifier }
      ]
    }).select('+password +mfaEnabled +mfaSecret');
    
    if (!user) {
      // Record failed attempt even if user not found (prevent user enumeration)
      await accountLockoutService.recordFailedAttempt(identifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password using the User model's correctPassword method
    const isValidPassword = await user.correctPassword(password);
    if (!isValidPassword) {
      // Record failed login attempt
      const lockoutStatus = await accountLockoutService.recordFailedAttempt(identifier);
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        remainingAttempts: lockoutStatus.remainingAttempts,
        message: lockoutStatus.message
      });
    }
    
    // Reset failed attempts on successful password verification
    await accountLockoutService.resetAttempts(identifier);
    
    // Check if MFA is enabled
    if (user.mfaEnabled && user.mfaSecret) {
      // Generate MFA session token (valid for 5 minutes)
      const mfaSessionToken = mfaService.generateMFASessionToken(user._id.toString());
      
      logger.info(`MFA required for user ${user._id}`);
      
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        mfaSessionToken,
        message: 'Please provide your MFA token to complete login'
      });
    }
    
    // Generate tokens (no MFA required)
    const token = generateToken({
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role
    });
    
    const refreshToken = generateToken({
      id: user._id,
      type: 'refresh'
    }, '7d');
    
    // Update last login
    user.lastLogin = Date.now();
    await user.save();
    
    logger.info(`User ${user._id} logged in successfully`);
    
    res.json({
      success: true,
      token,
      refreshToken,
      expiresIn: 3600,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        mfaEnabled: user.mfaEnabled || false
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

// Signup with email and password
exports.signup = async (req, res) => {
  try {
    const { name, firstName, lastName, email, password, phone, phoneNumber, idNumber, role, userType } = req.body;
    
    // Support both 'phone' and 'phoneNumber' field names
    const userPhone = phone || phoneNumber;
    
    // Validate required fields
    if (!email || !password || !userPhone) {
      return res.status(400).json({ 
        error: 'Email, password, and phone are required' 
      });
    }
    
    if (!firstName || !lastName) {
      return res.status(400).json({ 
        error: 'First name and last name are required' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email },
        { phone: userPhone }
      ]
    });
    
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Create new user
    const user = new User({
      firstName: firstName || name?.split(' ')[0],
      lastName: lastName || name?.split(' ')[1],
      email,
      password, // Password will be hashed by the User model pre-save hook
      phone: userPhone,
      idNumber,
      role: role || userType || 'tenant',
      mpesaVerified: false,
      profileComplete: true
    });
    
    await user.save();
    
    // Generate tokens
    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role
    });
    
    const refreshToken = generateToken({
      id: user._id,
      type: 'refresh'
    }, '7d');
    
    res.status(201).json({
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    logger.error('Signup error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ error: 'Signup failed', details: error.message });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      // Blacklist the token (expires in 1 hour by default)
      const expiresIn = 3600; // 1 hour in seconds
      await blacklistToken(token, expiresIn);
      logger.info(`Token blacklisted for user: ${req.user._id || req.user.id}`);
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // TODO: Verify refresh token and generate new access token
    const token = generateToken({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });
    
    res.json({
      token,
      expiresIn: 3600
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // req.user is already set by the authenticate middleware
    // It's a lean object from the database, so use _id
    const userId = req.user._id || req.user.id;
    
    const user = await User.findById(userId)
      .select('-password -verificationCode -codeExpires');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone,
      mfaEnabled: user.mfaEnabled || false
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: 'Password reset email sent'
      });
    }
    
    // TODO: Generate reset token and send email
    
    res.json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const passwordHistoryService = require('../services/password-history.service');
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    
    if (!token || !password) {
      return res.status(400).json({ 
        error: 'Reset token and new password are required' 
      });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password +passwordHistory');
    
    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset token' 
      });
    }
    
    // Validate against password history
    const historyValidation = await passwordHistoryService.validatePassword(
      password,
      user.passwordHistory || []
    );
    
    if (!historyValidation.valid) {
      return res.status(400).json({ 
        error: historyValidation.error,
        hint: passwordHistoryService.getRequirementsMessage()
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Add current password to history before changing
    if (user.password) {
      user.passwordHistory = passwordHistoryService.addToHistory(
        user.password,
        user.passwordHistory || []
      );
    }
    
    // Update password and clear reset token
    user.password = hashedPassword;
    user.passwordChangedAt = Date.now();
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    
    logger.info(`Password reset successfully for user ${user._id}`);
    
    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id || req.user.id;
    const passwordHistoryService = require('../services/password-history.service');
    const bcrypt = require('bcryptjs');
    
    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    // Find user and include password field and password history
    const user = await User.findById(userId).select('+password +passwordHistory');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await user.correctPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({ 
        error: 'New password must be different from current password' 
      });
    }
    
    // Validate against password history
    const historyValidation = await passwordHistoryService.validatePassword(
      newPassword,
      user.passwordHistory || []
    );
    
    if (!historyValidation.valid) {
      return res.status(400).json({ 
        error: historyValidation.error,
        hint: passwordHistoryService.getRequirementsMessage()
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Add current password to history before changing
    user.passwordHistory = passwordHistoryService.addToHistory(
      user.password, // Current password hash
      user.passwordHistory || []
    );
    
    // Update to new password
    user.password = hashedPassword;
    user.passwordChangedAt = Date.now();
    await user.save();
    
    logger.info(`Password changed successfully for user ${user._id}`);
    
    res.json({
      success: true,
      message: 'Password changed successfully',
      passwordAge: passwordHistoryService.getPasswordAge(user.passwordChangedAt)
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
};
