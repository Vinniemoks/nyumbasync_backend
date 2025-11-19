/**
 * MFA Routes
 * Multi-factor authentication endpoints
 */

const express = require('express');
const router = express.Router();
const mfaController = require('../../controllers/mfa.controller');
const { protect } = require('../../middlewares/auth.middleware');

// All MFA routes require authentication
router.use(protect);

/**
 * @route   POST /api/v1/auth/mfa/enable
 * @desc    Enable MFA for user account
 * @access  Private
 */
router.post('/enable', mfaController.enableMFA);

/**
 * @route   POST /api/v1/auth/mfa/verify
 * @desc    Verify and activate MFA
 * @access  Private
 */
router.post('/verify', mfaController.verifyMFA);

/**
 * @route   POST /api/v1/auth/mfa/disable
 * @desc    Disable MFA for user account
 * @access  Private
 */
router.post('/disable', mfaController.disableMFA);

/**
 * @route   POST /api/v1/auth/mfa/regenerate-backup-codes
 * @desc    Regenerate MFA backup codes
 * @access  Private
 */
router.post('/regenerate-backup-codes', mfaController.regenerateBackupCodes);

/**
 * @route   GET /api/v1/auth/mfa/status
 * @desc    Get MFA status for current user
 * @access  Private
 */
router.get('/status', mfaController.getMFAStatus);

module.exports = router;
