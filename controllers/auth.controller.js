const User = require('../models/user.model');
const crypto = require('crypto');
const { initiateSTKPush } = require('../services/mpesa.service');
const { generateToken } = require('../utils/auth'); // Corrected import name
const { validatePhone } = require('../utils/kenyanValidators');
const { formatKenyanPhone } = require('../utils/formatters');
const logger = require('../utils/logger'); // Import shared logger
const { blacklistToken } = require('../services/token-blacklist.service');
const emailService = require('../services/emailService');

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

    // Canonical 254XXXXXXXXX form — lookups and storage must never see
    // format variants (+254..., 07...) or the unique index is bypassed
    const normalizedPhone = formatKenyanPhone(phone);

    // Check if phone already registered
    const existingUser = await User.findOne({ phone: normalizedPhone });
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
      { phone: normalizedPhone },
      {
        phone: normalizedPhone,
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

    logger.info(`Verification code sent to ${normalizedPhone}`);

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

    // Find unexpired code record (phones are stored in canonical 254... form)
    const user = await User.findOne({
      phone: formatKenyanPhone(phone) || phone,
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

    // Mark user as verified
    user.mpesaVerified = true;
    user.verificationCode = undefined;
    user.codeExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken({
      id: user._id,
      role: user.role,
      kraPin: user.kraPin || null,
      phone: user.phone
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role,
        mpesaVerified: true
      }
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
    const LoginAudit = require('../models/login-audit.model');

    // Fire-and-forget audit trail of every attempt — never blocks login.
    const audit = (fields) => {
      try {
        LoginAudit.create({
          identifier: typeof identifier === 'string' ? identifier.toLowerCase() : undefined,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          ...fields,
        }).catch(() => {});
      } catch (_) { /* auditing must never break auth */ }
    };

    // Validate required fields
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    // Reject non-string credentials — a JSON object like { $ne: null } is a
    // NoSQL-injection probe and must never reach the query layer.
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid credentials format' });
    }

    // Check if account is locked
    const lockStatus = await accountLockoutService.isLocked(identifier);
    if (lockStatus.locked) {
      audit({ success: false, reason: 'account_locked' });
      return res.status(423).json({
        error: 'Account locked',
        message: lockStatus.message,
        lockoutUntil: lockStatus.lockoutUntil
      });
    }

    // Find user by email or phone and include password field.
    // Phones are stored in canonical 254XXXXXXXXX form, so normalize the
    // identifier before matching (accepts +254..., 07..., 254...).
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { phone: formatKenyanPhone(identifier) || identifier }
      ]
    }).select('+password +mfaEnabled +mfaSecret');

    if (!user) {
      // Record failed attempt even if user not found (prevent user enumeration)
      await accountLockoutService.recordFailedAttempt(identifier);
      audit({ success: false, reason: 'unknown_identifier' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password using the User model's correctPassword method
    const isValidPassword = await user.correctPassword(password);
    if (!isValidPassword) {
      // Record failed login attempt
      const lockoutStatus = await accountLockoutService.recordFailedAttempt(identifier);
      audit({ success: false, reason: 'wrong_password', user: user._id, email: user.email, role: user.role });

      return res.status(401).json({
        error: 'Invalid credentials',
        remainingAttempts: lockoutStatus.remainingAttempts,
        message: lockoutStatus.message
      });
    }

    // Reset failed attempts on successful password verification
    await accountLockoutService.resetAttempts(identifier);

    // --- Admin 2FA ---------------------------------------------------------
    // Admins must complete a second factor. Preferred order:
    //   1. TOTP authenticator app (Google Authenticator, Authy, etc.)
    //   2. Emailed one-time code
    // WhatsApp is no longer required because it is unreliable in Kenya.
    // If no factor is configured yet, password-only login is allowed once so
    // the admin can set up TOTP from the dashboard; this is logged as a
    // security warning.
    const adminRoles = ['admin', 'super_admin'];
    const isAdminAccount = adminRoles.includes(user.role) ||
      (Array.isArray(user.roles) && user.roles.some(r => adminRoles.includes(r)));

    if (isAdminAccount) {
      // 1) Authenticator app (TOTP)
      if (user.mfaEnabled && user.mfaSecret) {
        const mfaSessionToken = mfaService.generateMFASessionToken(user._id.toString());
        logger.info(`Admin TOTP required for user ${user._id}`);
        audit({ success: true, reason: 'ok_mfa_pending', user: user._id, email: user.email, role: user.role, method: 'totp' });
        return res.status(200).json({
          success: true,
          mfaRequired: true,
          mfaMethod: 'totp',
          mfaSessionToken,
          message: 'Enter the 6-digit code from your authenticator app to complete login'
        });
      }

      // 2) Email OTP fallback
      if (user.mfaEmailEnabled || user.email) {
        const mfaSessionToken = mfaService.generateMFASessionToken(user._id.toString());
        let channels = { emailSent: false, whatsappSent: false };
        try {
          channels = await require('../services/verification.service').sendLoginOtp(user);
        } catch (otpErr) {
          logger.error('Admin email OTP delivery failed:', otpErr);
        }

        // If email delivery is unavailable and no other factor exists, do not
        // lock the admin out; fall through to the password-only path below so
        // they can set up TOTP.
        if (channels.emailSent) {
          logger.info(`Admin email OTP required for user ${user._id}`);
          audit({ success: true, reason: 'ok_mfa_pending', user: user._id, email: user.email, role: user.role, method: 'email' });
          return res.status(200).json({
            success: true,
            mfaRequired: true,
            mfaMethod: 'email',
            mfaSessionToken,
            emailOtpSent: true,
            message: 'Enter the 8-digit code we emailed you to complete login'
          });
        }
      }

      // 3) No factor configured yet: allow password-only login with a warning,
      // and prompt the frontend to set up MFA on first login.
      logger.warn(`Admin ${user._id} logged in without any MFA configured`);
      audit({ success: true, reason: 'admin_login_no_mfa', user: user._id, email: user.email, role: user.role });
      req._requireMfaSetup = true;
    }

    // Check if MFA is enabled (authenticator app) for non-admin accounts
    if (user.mfaEnabled && user.mfaSecret) {
      // Generate MFA session token (valid for 5 minutes)
      const mfaSessionToken = mfaService.generateMFASessionToken(user._id.toString());

      logger.info(`MFA required for user ${user._id}`);
      audit({ success: true, reason: 'ok_mfa_pending', user: user._id, email: user.email, role: user.role });

      return res.status(200).json({
        success: true,
        mfaRequired: true,
        mfaMethod: 'totp',
        mfaSessionToken,
        message: 'Please provide your MFA token to complete login'
      });
    }

    // Email-OTP MFA — for non-admin accounts that opted in without an authenticator app.
    if (user.mfaEmailEnabled) {
      const mfaSessionToken = mfaService.generateMFASessionToken(user._id.toString());
      let channels = { emailSent: false, whatsappSent: false };
      try {
        channels = await require('../services/verification.service').sendLoginOtp(user);
      } catch (otpErr) {
        logger.error('Login OTP delivery failed:', otpErr);
      }
      logger.info(`Email MFA required for user ${user._id} (email=${channels.emailSent})`);
      audit({ success: true, reason: 'ok_mfa_pending', user: user._id, email: user.email, role: user.role, method: 'email' });
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        mfaMethod: 'email',
        mfaSessionToken,
        emailOtpSent: channels.emailSent,
        message: channels.emailSent
          ? 'Enter the 8-digit code we just emailed you to complete login'
          : 'Could not send the email code — email delivery is not configured. Contact support.'
      });
    }

    // --- First-login password change check ---
    if (user.requirePasswordChange) {
      const jwt = require('jsonwebtoken');
      const tempToken = jwt.sign(
        { userId: user._id, purpose: 'password-change' },
        process.env.JWT_SECRET,
        { expiresIn: '5m', algorithm: 'HS256' }
      );

      logger.info(`Password change required for user ${user._id}`);
      audit({ success: true, reason: 'require_password_change', user: user._id, email: user.email, role: user.role });

      return res.status(200).json({
        requirePasswordChange: true,
        message: 'You must change your password before continuing',
        token: tempToken
      });
    }

    // --- New IP verification for high-ranked admins ---
    const userIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const isAdminRole = ['admin', 'super_admin'].includes(user.role);
    const isKnownIp = user.knownIps && user.knownIps.some(entry => entry.ip === userIp);

    if (isAdminRole && !isKnownIp) {
      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = crypto
        .createHash('sha256')
        .update(verificationCode)
        .digest('hex');

      user.ipVerificationCode = hashedCode;
      user.ipVerificationCodeExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save();

      // Email the code
      let emailSent = false;
      try {
        emailSent = await emailService.sendEmail({
          to: user.email,
          subject: 'NyumbaSync - New Login Verification Code',
          html: `<p>Hello ${user.firstName},</p><p>A login was attempted from a new IP address: <strong>${userIp}</strong>.</p><p>Your verification code is: <strong>${verificationCode}</strong></p><p>This code will expire in 5 minutes.</p><p>If you did not attempt this login, please contact support immediately.</p>`
        });
      } catch (emailErr) {
        logger.error('Failed to send IP verification email:', emailErr);
      }

      // Generate ipSessionToken
      const jwt = require('jsonwebtoken');
      const ipSessionToken = jwt.sign(
        { userId: user._id, expectedIp: userIp, purpose: 'ip-verification' },
        process.env.JWT_SECRET,
        { expiresIn: '5m', algorithm: 'HS256' }
      );

      logger.info(`IP verification required for admin user ${user._id} from ${userIp}`);
      audit({ success: true, reason: 'require_ip_verification', user: user._id, email: user.email, role: user.role });

      return res.status(200).json({
        requireIpVerification: true,
        ipSessionToken,
        emailSent,
        message: 'A verification code has been sent to your email'
      });
    }

    // --- IP tracking on successful login ---
    // Update knownIps (up to 20 entries, update lastSeen if IP already exists)
    if (!user.knownIps) user.knownIps = [];
    const knownIpIndex = user.knownIps.findIndex(entry => entry.ip === userIp);
    if (knownIpIndex !== -1) {
      user.knownIps[knownIpIndex].lastSeen = new Date();
    } else {
      user.knownIps.push({ ip: userIp, firstSeen: new Date(), lastSeen: new Date() });
      if (user.knownIps.length > 20) {
        user.knownIps = user.knownIps.slice(-20);
      }
    }

    // Append to loginIps (keep last 10)
    if (!user.loginIps) user.loginIps = [];
    user.loginIps.push(userIp);
    if (user.loginIps.length > 10) {
      user.loginIps = user.loginIps.slice(-10);
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

    logger.info(`User ${user._id} logged in successfully from ${userIp}`);
    audit({ success: true, reason: 'ok', user: user._id, email: user.email, role: user.role });

    res.json({
      success: true,
      token,
      refreshToken,
      expiresIn: 3600,
      requireMfaSetup: req._requireMfaSetup || false,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: user.roles,
        phone: user.phone,
        mfaEnabled: user.mfaEnabled || false,
        emailVerified: user.emailVerified || false
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

// Verify IP for high-ranked admin login from new IP
exports.verifyIp = async (req, res) => {
  try {
    const { ipSessionToken, code } = req.body;

    if (!ipSessionToken || !code) {
      return res.status(400).json({ error: 'ipSessionToken and code are required' });
    }

    // Verify the JWT
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(ipSessionToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    if (decoded.purpose !== 'ip-verification') {
      return res.status(401).json({ error: 'Invalid token purpose' });
    }

    // Find user and include the hidden verification code field
    const user = await User.findById(decoded.userId).select('+ipVerificationCode');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if code is expired
    if (!user.ipVerificationCodeExpiry || user.ipVerificationCodeExpiry < Date.now()) {
      return res.status(400).json({ error: 'Verification code expired' });
    }

    // Verify code
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (user.ipVerificationCode !== hashedCode) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Clear verification code
    user.ipVerificationCode = undefined;
    user.ipVerificationCodeExpiry = undefined;

    // Record the IP as known
    const userIp = decoded.expectedIp || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!user.knownIps) user.knownIps = [];
    const knownIpIndex = user.knownIps.findIndex(entry => entry.ip === userIp);
    if (knownIpIndex !== -1) {
      user.knownIps[knownIpIndex].lastSeen = new Date();
    } else {
      user.knownIps.push({ ip: userIp, firstSeen: new Date(), lastSeen: new Date() });
      if (user.knownIps.length > 20) {
        user.knownIps = user.knownIps.slice(-20);
      }
    }

    // Append to loginIps (keep last 10)
    if (!user.loginIps) user.loginIps = [];
    user.loginIps.push(userIp);
    if (user.loginIps.length > 10) {
      user.loginIps = user.loginIps.slice(-10);
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Generate tokens (same as normal login)
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

    logger.info(`Admin user ${user._id} verified IP ${userIp} and logged in successfully`);

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
        roles: user.roles,
        phone: user.phone,
        mfaEnabled: user.mfaEnabled || false,
        emailVerified: user.emailVerified || false
      }
    });
  } catch (error) {
    logger.error('IP verification error:', error);
    res.status(500).json({ error: 'IP verification failed', details: error.message });
  }
};

// Signup with email and password
exports.signup = async (req, res) => {
  try {
    const { name, firstName, lastName, email, password, phone, phoneNumber, idNumber, role, roles, userType } = req.body;

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

    // Validate input FORMAT before touching the DB, so a malformed request is
    // a clear 400 (not a 409 that happens to collide with an existing record).
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    if (!validatePhone(userPhone)) {
      return res.status(400).json({ error: 'Invalid Kenyan phone (must start with 2547 or 2541)' });
    }

    // Canonical 254XXXXXXXXX form — dup-check and storage must never see
    // format variants (+254..., 07...) or the unique index is bypassed
    const normalizedPhone = formatKenyanPhone(userPhone);

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email },
        { phone: normalizedPhone }
      ]
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // RBAC: only non-privileged roles may be self-registered. Admin and
    // manager accounts are provisioned by an existing admin, never via
    // public signup — otherwise anyone could register as admin.
    const SELF_REGISTRABLE_ROLES = ['tenant', 'landlord', 'agent', 'vendor'];
    // Accept either a single role or a list of roles (multi-role accounts).
    // Anything not self-registrable is dropped; if nothing valid remains we
    // fall back to 'tenant'.
    const requestedRoles = (Array.isArray(roles) && roles.length ? roles : [role || userType])
      .filter(Boolean);
    const safeRoles = [...new Set(requestedRoles.filter((r) => SELF_REGISTRABLE_ROLES.includes(r)))];
    if (safeRoles.length === 0) safeRoles.push('tenant');
    const safeRole = safeRoles[0];

    // Create new user
    const user = new User({
      firstName: firstName || name?.split(' ')[0],
      lastName: lastName || name?.split(' ')[1],
      email,
      password, // Password will be hashed by the User model pre-save hook
      phone: normalizedPhone,
      idNumber,
      role: safeRole,
      roles: safeRoles,
      mpesaVerified: false,
    });

    // Persist the account — without this the signup silently created nothing.
    await user.save();

    // Send the email-confirmation link + code. Best-effort: signup must not
    // fail because the email provider is down/unconfigured.
    let emailVerificationSent = false;
    try {
      emailVerificationSent = !!(await require('../services/verification.service').sendEmailVerification(user));
    } catch (mailErr) {
      logger.error('Signup verification email failed:', mailErr);
    }

    // Billable roles (everyone except tenant) start on the Free tier.
    const { BILLABLE_ROLES } = require('../config/pricingPlans');
    if (BILLABLE_ROLES.includes(user.role)) {
      const Subscription = require('../models/subscription.model');
      await Subscription.create({ user: user._id, role: user.role, tier: 'free', status: 'active' });
    }

    const token = generateToken({
      id: user._id,
      role: user.role
    });

    const refreshToken = generateToken({
      id: user._id,
      type: 'refresh'
    }, '7d');

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      emailVerificationSent,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: user.roles,
        phone: user.phone,
        emailVerified: false
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

// Confirm an email address via the emailed link token or { email, code }.
exports.verifyEmail = async (req, res) => {
  try {
    const { token, email, code } = { ...req.query, ...req.body };
    if (!token && !(email && code)) {
      return res.status(400).json({ error: 'A verification token, or an email and code, is required' });
    }
    const verificationService = require('../services/verification.service');
    const user = await verificationService.verifyEmail({ token, email, code }, User);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link/code. Request a new one.' });
    }
    return res.json({ success: true, message: 'Email verified. Welcome to NyumbaSync!' });
  } catch (error) {
    logger.error('Email verification error:', error);
    return res.status(500).json({ error: 'Email verification failed' });
  }
};

// Re-send the confirmation email for the logged-in user.
exports.resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) {
      return res.json({ success: true, message: 'Your email is already verified.' });
    }
    const sent = await require('../services/verification.service').sendEmailVerification(user);
    if (!sent) {
      return res.status(503).json({ error: 'Email delivery is not configured on the server.' });
    }
    return res.json({ success: true, message: `Verification email sent to ${user.email}.` });
  } catch (error) {
    logger.error('Resend verification error:', error);
    return res.status(500).json({ error: 'Could not resend the verification email' });
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

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify the refresh token
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Check user still exists
    const user = await User.findById(decoded.id).select('_id email phone role status');
    if (!user || user.status === 'suspended') {
      return res.status(401).json({ error: 'User account not found or suspended' });
    }

    // Generate new access token
    const token = generateToken({
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role
    });

    const newRefreshToken = generateToken(
      { id: user._id, type: 'refresh' },
      '7d'
    );

    res.json({
      token,
      refreshToken: newRefreshToken,
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
      roles: user.roles,
      phone: user.phone,
      mfaEnabled: user.mfaEnabled || false,
      emailVerified: user.emailVerified || false
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

    // Generate a secure reset token and store its hash on the user
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    // Send reset email
    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/reset-password?token=${resetToken}`;
      await emailService.sendEmail({
        to: user.email,
        subject: 'NyumbaSync - Password Reset',
        text: `You requested a password reset. Use this link (valid for 10 minutes): ${resetUrl}\n\nIf you did not request this, ignore this email.`,
        html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a> (valid for 10 minutes)</p><p>If you did not request this, ignore this email.</p>`
      });
    } catch (emailError) {
      logger.error('Failed to send reset email:', emailError);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ error: 'Failed to send reset email. Try again later.' });
    }

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

    // Snapshot the current (still-hashed) password into history before we
    // overwrite it. The model's pre('save') hook hashes the new password —
    // hashing here too would double-hash and break the next login.
    if (user.password) {
      user.passwordHistory = passwordHistoryService.addToHistory(
        user.password,
        user.passwordHistory || []
      );
    }

    // Update password (model hook hashes it on save) and clear reset token
    user.password = password;
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

    // Snapshot the current (still-hashed) password into history BEFORE we
    // overwrite it. The User model's pre('save') hook hashes the new password
    // for us — hashing here too would double-hash and break the next login.
    user.passwordHistory = passwordHistoryService.addToHistory(
      user.password, // Current password hash
      user.passwordHistory || []
    );

    // Update to new password (model hook hashes it on save)
    user.password = newPassword;
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

// ───────────────────────────────────────────
// OAuth Authentication (Google & Apple)
// ───────────────────────────────────────────

/**
 * Google OAuth — POST /api/v1/auth/google
 * Accepts a Google ID token from the frontend and returns a NyumbaSync JWT.
 * Requires: google-auth-library (npm install google-auth-library)
 */
exports.googleAuth = async (req, res) => {
  try {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const {
      sub: googleId,
      email,
      given_name: firstName,
      family_name: lastName,
      email_verified,
    } = payload;

    // Find existing user by email or googleId
    const orConditions = [{ googleId }];
    if (email) {
      orConditions.push({ email: email.toLowerCase() });
    }
    let user = await User.findOne({ $or: orConditions });

    if (!user) {
      // Create new OAuth user with a random password placeholder
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(32).toString('hex');

      user = new User({
        firstName: firstName || 'Google',
        lastName: lastName || 'User',
        email: email ? email.toLowerCase() : undefined,
        phone: `google_${googleId}`,
        password: randomPassword,
        googleId,
        role: 'tenant',
        roles: ['tenant'],
        emailVerified: email_verified === true,
        status: 'active',
      });

      await user.save();
    } else {
      // Link Google ID if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    }

    // Generate JWT and refresh token (same response as normal login)
    const token = generateToken({
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });

    const refreshToken = generateToken(
      { id: user._id, type: 'refresh' },
      '7d'
    );

    user.lastLogin = Date.now();
    await user.save();

    logger.info(`Google OAuth login: user ${user._id}`);

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
        roles: user.roles,
        phone: user.phone,
        mfaEnabled: user.mfaEnabled || false,
      },
      requiresPhoneUpdate: user.phone?.startsWith('google_') || user.phone?.startsWith('apple_'),
    });
  } catch (error) {
    logger.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed', details: error.message });
  }
};

/**
 * Apple OAuth — POST /api/v1/auth/apple
 * Accepts an Apple identity token (JWT) and optional user object from the frontend.
 * Verifies the token using Apple's public keys via jsonwebtoken (already installed).
 */
exports.appleAuth = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { createPublicKey } = require('crypto');
    const axios = require('axios');

    const { identityToken, user } = req.body;

    if (!identityToken) {
      return res.status(400).json({ error: 'Apple identity token is required' });
    }

    // Decode the header to get the key ID (kid) without verification
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return res.status(400).json({ error: 'Invalid Apple identity token' });
    }

    // Fetch Apple's public keys
    const { data: jwks } = await axios.get('https://appleid.apple.com/auth/keys');
    const jwk = jwks.keys.find((k) => k.kid === decoded.header.kid);
    if (!jwk) {
      return res.status(400).json({ error: 'Apple signing key not found' });
    }

    // Convert JWK to PEM using Node's built-in crypto
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const pem = publicKey.export({ format: 'pem', type: 'spki' });

    // Verify the Apple identity token
    const payload = jwt.verify(identityToken, pem, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: process.env.APPLE_CLIENT_ID,
    });

    const appleId = payload.sub;
    const email = payload.email;
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    // Find existing user by email or appleId
    const orConditions = [{ appleId }];
    if (email) {
      orConditions.push({ email: email.toLowerCase() });
    }
    let existingUser = await User.findOne({ $or: orConditions });

    if (!existingUser) {
      // Create new OAuth user with a random password placeholder
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(32).toString('hex');

      existingUser = new User({
        firstName: user?.firstName || 'Apple',
        lastName: user?.lastName || 'User',
        email: email ? email.toLowerCase() : undefined,
        phone: `apple_${appleId}`,
        password: randomPassword,
        appleId,
        role: 'tenant',
        roles: ['tenant'],
        emailVerified: emailVerified,
        status: 'active',
      });

      await existingUser.save();
    } else {
      // Link Apple ID if not already set
      if (!existingUser.appleId) {
        existingUser.appleId = appleId;
        await existingUser.save();
      }
    }

    // Generate JWT and refresh token (same response as normal login)
    const token = generateToken({
      id: existingUser._id,
      email: existingUser.email,
      phone: existingUser.phone,
      role: existingUser.role,
    });

    const refreshToken = generateToken(
      { id: existingUser._id, type: 'refresh' },
      '7d'
    );

    existingUser.lastLogin = Date.now();
    await existingUser.save();

    logger.info(`Apple OAuth login: user ${existingUser._id}`);

    res.json({
      success: true,
      token,
      refreshToken,
      expiresIn: 3600,
      user: {
        id: existingUser._id,
        email: existingUser.email,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        role: existingUser.role,
        roles: existingUser.roles,
        phone: existingUser.phone,
        mfaEnabled: existingUser.mfaEnabled || false,
      },
      requiresPhoneUpdate:
        existingUser.phone?.startsWith('google_') ||
        existingUser.phone?.startsWith('apple_'),
    });
  } catch (error) {
    logger.error('Apple auth error:', error);
    res.status(500).json({ error: 'Apple authentication failed', details: error.message });
  }
};

// Activate account via admin-provisioned activation token
exports.activateAccount = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Activation token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      activationToken: hashedToken,
      activationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired activation token' });
    }

    user.isEmailVerified = true;
    user.emailVerified = true;
    user.activationToken = undefined;
    user.activationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info(`Account activated for user ${user._id}`);

    res.json({
      success: true,
      message: 'Account activated successfully. You can now log in.'
    });
  } catch (error) {
    logger.error('Account activation error:', error);
    res.status(500).json({ error: 'Account activation failed' });
  }
};
