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

    // Generate JWT token (complete login)
    const jwt = require('jsonwebtoken');
    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
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
