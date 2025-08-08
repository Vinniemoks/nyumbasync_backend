// C:\Users\USER\NyumbaSync\nyumbasync_backend\routes\v1\user.routes.js
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { param, body, validationResult } = require('express-validator');
const smsService = require('../../services/sms.service');
const userController = require('../../controllers/user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateUpdateUser } = require('../../middlewares/validation');
const User = require('../../models/user.model');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// User Profile Routes
router.get('/profile', authenticate, asyncHandler(userController.getUserProfile));

router.put('/profile', authenticate, validateUpdateUser, asyncHandler(userController.updateProfile));

router.put('/profile/complete', authenticate, [
  body('name').isString().trim().notEmpty().withMessage('Name is required'),
  body('idNumber').isString().trim().notEmpty().withMessage('ID number is required'),
  body('kraPin').isString().trim().notEmpty().withMessage('KRA PIN is required')
], validate, asyncHandler(userController.completeProfile));

// Phone Verification Routes
router.post('/verify-phone', authenticate, [
  body('phone').isString().matches(/^\+254\d{9}$/).withMessage('Invalid phone format')
], validate, asyncHandler(userController.initiatePhoneVerification));

router.post('/confirm-verification', authenticate, [
  body('code').isString().matches(/^\d{6}$/).withMessage('Invalid verification code')
], validate, asyncHandler(userController.confirmVerificationCode));

// Landlord Routes
router.get('/properties', authenticate('landlord'), asyncHandler(userController.getUserProperties));

router.get('/houses', authenticate('tenant'), asyncHandler(userController.getUserHouses));

// Admin Routes
router.get('/admin/users', authenticate('admin'), asyncHandler(userController.listUsers));

router.get('/admin/users/:id', [
  param('id').isMongoId().withMessage('Invalid user ID')
], validate, authenticate('admin'), asyncHandler(userController.getUserById));

router.patch('/admin/users/:id/status', [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('status').isIn(['active', 'suspended', 'inactive']).withMessage('Invalid status')
], validate, authenticate('admin'), asyncHandler(userController.updateUserStatus));

router.post('/admin/users/:id/notify', [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('message').isString().trim().notEmpty().withMessage('Message is required')
], validate, authenticate('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  try {
    const user = await User.findById(id).select('phone');
    if (!user || !user.phone) {
      return res.status(400).json({ success: false, error: 'User has no registered phone number' });
    }
    await smsService.sendSMS({ phoneNumber: user.phone, message });
    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send notification' });
  }
}));

// Error Handling Middleware
router.use((err, req, res, next) => {
  console.error('User route error:', err);
  if (process.env.ADMIN_PHONE) {
    smsService.sendSMS({
      phoneNumber: process.env.ADMIN_PHONE,
      message: `User Route Error: ${err.message}`
    }).catch(e => console.error('Failed to send error SMS:', e));
  }
  res.status(500).json({ 
    error: 'User operation failed',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;