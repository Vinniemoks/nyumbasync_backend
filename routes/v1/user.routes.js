const express = require('express');
const router = express.Router();
const userController = require('../../controllers/user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateUpdateUser } = require('../../middlewares/validation');

// User profile routes
router.get('/profile', 
  authenticate, 
  userController.getUserProfile
);

router.put('/profile',
  authenticate,
  validateUpdateUser,
  userController.updateProfile
);

// Admin-only user management
router.get('/',
  authenticate('admin'),
  userController.listUsers
);

router.get('/:userId',
  authenticate('admin'),
  userController.getUserById
);

router.patch('/:userId/status',
  authenticate('admin'),
  userController.updateUserStatus
);

// Phone verification
router.post('/verify-phone',
  authenticate,
  userController.initiatePhoneVerification
);

router.post('/confirm-verification',
  authenticate,
  userController.confirmVerificationCode
);

module.exports = router;