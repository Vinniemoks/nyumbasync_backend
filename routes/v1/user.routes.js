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

module.exports = [
  // User Profile Routes
  {
    method: 'GET',
    path: '/profile',
    handler: [
      authenticate,
      asyncHandler(userController.getUserProfile)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'PUT',
    path: '/profile',
    handler: [
      authenticate,
      validateUpdateUser,
      asyncHandler(userController.updateProfile)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'PUT',
    path: '/profile/complete',
    handler: [
      authenticate,
      [
        body('name').isString().trim().notEmpty().withMessage('Name is required'),
        body('idNumber').isString().trim().notEmpty().withMessage('ID number is required'),
        body('kraPin').isString().trim().notEmpty().withMessage('KRA PIN is required')
      ],
      validate,
      asyncHandler(userController.completeProfile)
    ],
    config: { source: 'user.routes' }
  },

  // Phone Verification Routes
  {
    method: 'POST',
    path: '/verify-phone',
    handler: [
      authenticate,
      [
        body('phone').isString().matches(/^\+254\d{9}$/).withMessage('Invalid phone format')
      ],
      validate,
      asyncHandler(userController.initiatePhoneVerification)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'POST',
    path: '/confirm-verification',
    handler: [
      authenticate,
      [
        body('code').isString().matches(/^\d{6}$/).withMessage('Invalid verification code')
      ],
      validate,
      asyncHandler(userController.confirmVerificationCode)
    ],
    config: { source: 'user.routes' }
  },

  // Landlord Routes
  {
    method: 'GET',
    path: '/properties',
    handler: [
      authenticate('landlord'),
      asyncHandler(userController.getUserProperties)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'GET',
    path: '/houses',
    handler: [
      authenticate('tenant'),
      asyncHandler(userController.getUserHouses)
    ],
    config: { source: 'user.routes' }
  },

  // Admin Routes
  {
    method: 'GET',
    path: '/admin/users',
    handler: [
      authenticate('admin'),
      asyncHandler(userController.listUsers)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'GET',
    path: '/admin/users/:id',
    handler: [
      param('id').isMongoId().withMessage('Invalid user ID'),
      validate,
      authenticate('admin'),
      asyncHandler(userController.getUserById)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'PATCH',
    path: '/admin/users/:id/status',
    handler: [
      param('id').isMongoId().withMessage('Invalid user ID'),
      body('status').isIn(['active', 'suspended', 'inactive']).withMessage('Invalid status'),
      validate,
      authenticate('admin'),
      asyncHandler(userController.updateUserStatus)
    ],
    config: { source: 'user.routes' }
  },
  {
    method: 'POST',
    path: '/admin/users/:id/notify',
    handler: [
      param('id').isMongoId().withMessage('Invalid user ID'),
      body('message').isString().trim().notEmpty().withMessage('Message is required'),
      validate,
      authenticate('admin'),
      asyncHandler(async (req, res) => {
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
      })
    ],
    config: { source: 'user.routes' }
  }
];
