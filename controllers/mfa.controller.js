/**
 * MFA Controller
 * Handles multi-factor authentication operations
 */

const User = require('../models/user.model');
const mfaService = require('../services/mfa.service');
const { sanitizeLog } = require('../utils/log-sanitizer');

/**
 * Enable MFA for user
 * @route POST /api/v1/auth/mfa/enable
 */
exports.enableMFA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mfaSecret');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is already enabled for this account'
      });
    }

    // Generate MFA secret and QR code
    const { secret, qrCode, otpauthUrl } = await mfaService.generateSecret(user.email || user.phone);

    // Generate backup codes
    const backupCodes = mfaService.generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(code => mfaService.hashBackupCode(code));

    // Save secret and backup codes (but don't enable yet)
    user.mfaSecret = secret;
    user.mfaBackupCodes = hashedBackupCodes;
    user.mfaEnabled = false; // Will be enabled after verification
    await user.save();

    console.log(sanitizeLog('MFA setup initiated', {
      userId: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      message: 'MFA setup initiated. Please scan the QR code with your authenticator app and verify.',
      data: {
        qrCode,
        secret, // Show once for manual entry
        backupCodes, // Show once - user must save these
        otpauthUrl
      }
    });
  } catch (error) {
    console.error('Enable MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable MFA'
    });
  }
};

/**
 * Verify and activate MFA
 * @route POST /api/v1/auth/mfa/verify
 */
exports.verifyMFA = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MFA token is required'
      });
    }

    const user = await User.findById(req.user.id).select('+mfaSecret');

    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        error: 'MFA is not set up for this account'
      });
    }

    // Verify the token
    const isValid = mfaService.verifyToken(user.mfaSecret, token);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid MFA token'
      });
    }

    // Enable MFA
    user.mfaEnabled = true;
    user.mfaVerified = true;
    await user.save();

    console.log(sanitizeLog('MFA enabled successfully', {
      userId: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      message: 'MFA has been successfully enabled for your account'
    });
  } catch (error) {
    console.error('Verify MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify MFA'
    });
  }
};

/**
 * Step-up verification: re-confirm the authenticated user's identity with a
 * TOTP token or backup code. Unlike verifyMFA (which activates MFA), this has
 * no side effects — it just answers "is this really you, right now?". Used to
 * gate privileged actions such as switching into an admin role.
 * @route POST /api/v1/auth/mfa/step-up
 */
exports.verifyStepUp = async (req, res) => {
  try {
    const { token, backupCode } = req.body;

    if (!token && !backupCode) {
      return res.status(400).json({
        success: false,
        error: 'An MFA token or backup code is required'
      });
    }

    const user = await User.findById(req.user.id).select('+mfaSecret +mfaBackupCodes');

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        error: 'MFA is not enabled for this account'
      });
    }

    let isValid = false;
    if (backupCode) {
      const result = mfaService.verifyBackupCode(backupCode, user.mfaBackupCodes || []);
      isValid = result.valid;
      // Consume the used backup code so it can't be replayed.
      if (isValid) {
        user.mfaBackupCodes = result.remainingCodes;
        await user.save();
      }
    } else {
      isValid = mfaService.verifyToken(user.mfaSecret, token);
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    console.log(sanitizeLog('Step-up MFA verification succeeded', {
      userId: user._id,
      method: backupCode ? 'backup_code' : 'totp'
    }));

    return res.status(200).json({ success: true, verified: true });
  } catch (error) {
    console.error('Step-up MFA error:', error);
    return res.status(500).json({ success: false, error: 'Step-up verification failed' });
  }
};

/**
 * Disable MFA for user
 * @route POST /api/v1/auth/mfa/disable
 */
exports.disableMFA = async (req, res) => {
  try {
    const { password, token } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required to disable MFA'
      });
    }

    const user = await User.findById(req.user.id).select('+password +mfaSecret');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify password
    const isPasswordCorrect = await user.correctPassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    // If MFA is enabled, require token
    if (user.mfaEnabled && user.mfaSecret) {
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'MFA token is required'
        });
      }

      const isValid = mfaService.verifyToken(user.mfaSecret, token);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid MFA token'
        });
      }
    }

    // Disable MFA
    user.mfaEnabled = false;
    user.mfaVerified = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = [];
    await user.save();

    console.log(sanitizeLog('MFA disabled', {
      userId: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      message: 'MFA has been disabled for your account'
    });
  } catch (error) {
    console.error('Disable MFA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable MFA'
    });
  }
};

/**
 * Verify MFA token during login
 * @route POST /api/v1/auth/mfa/verify-login
 */
exports.verifyMFALogin = async (req, res) => {
  try {
    const { mfaSessionToken, token, backupCode } = req.body;

    if (!mfaSessionToken) {
      return res.status(400).json({
        success: false,
        error: 'MFA session token is required'
      });
    }

    if (!token && !backupCode) {
      return res.status(400).json({
        success: false,
        error: 'MFA token or backup code is required'
      });
    }

    // Verify MFA session token
    const sessionVerification = mfaService.verifyMFASessionToken(mfaSessionToken);
    if (!sessionVerification.valid) {
      return res.status(401).json({
        success: false,
        error: sessionVerification.error || 'Invalid or expired MFA session'
      });
    }

    const user = await User.findById(sessionVerification.userId).select('+mfaSecret +mfaBackupCodes');

    if (!user || !user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is not enabled for this account'
      });
    }

    let isValid = false;

    // Verify with token or backup code
    if (token) {
      isValid = mfaService.verifyToken(user.mfaSecret, token);
    } else if (backupCode) {
      const verification = mfaService.verifyBackupCode(backupCode, user.mfaBackupCodes);
      isValid = verification.valid;

      if (isValid) {
        // Update backup codes (remove used code)
        user.mfaBackupCodes = verification.remainingCodes;
        await user.save();

        console.log(sanitizeLog('Backup code used', {
          userId: user._id,
          codesRemaining: verification.codesLeft
        }));
      }
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid MFA token or backup code'
      });
    }

    // Generate JWT token (complete login). Use the shared generator so the
    // claims (userId, iss, aud) match what the auth middleware verifies —
    // a manually signed token without them is rejected on the next request.
    const jwt = require('jsonwebtoken');
    const { generateToken } = require('../utils/auth');
    const accessToken = generateToken({ id: user._id, role: user.role });

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    console.log(sanitizeLog('MFA login successful', {
      userId: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('MFA login verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify MFA'
    });
  }
};

/**
 * Regenerate backup codes
 * @route POST /api/v1/auth/mfa/regenerate-backup-codes
 */
exports.regenerateBackupCodes = async (req, res) => {
  try {
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({
        success: false,
        error: 'Password and MFA token are required'
      });
    }

    const user = await User.findById(req.user.id).select('+password +mfaSecret');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'MFA is not enabled for this account'
      });
    }

    // Verify password
    const isPasswordCorrect = await user.correctPassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    // Verify MFA token
    const isValid = mfaService.verifyToken(user.mfaSecret, token);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid MFA token'
      });
    }

    // Generate new backup codes
    const backupCodes = mfaService.generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(code => mfaService.hashBackupCode(code));

    user.mfaBackupCodes = hashedBackupCodes;
    await user.save();

    console.log(sanitizeLog('Backup codes regenerated', {
      userId: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      message: 'Backup codes regenerated successfully. Please save these codes in a secure location.',
      data: {
        backupCodes
      }
    });
  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate backup codes'
    });
  }
};

/**
 * Get MFA status
 * @route GET /api/v1/auth/mfa/status
 */
exports.getMFAStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mfaBackupCodes');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        mfaEnabled: user.mfaEnabled || false,
        mfaVerified: user.mfaVerified || false,
        backupCodesRemaining: user.mfaBackupCodes ? user.mfaBackupCodes.length : 0
      }
    });
  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MFA status'
    });
  }
};
