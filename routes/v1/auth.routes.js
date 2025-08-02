const express = require('express');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const {
  validatePhoneRegistration,
  validateVerificationCode
} = require('../../middlewares/validation');
const { authenticate } = require('../../middlewares/auth.middleware');

// M-Pesa phone registration
router.post('/register',
  validatePhoneRegistration,
  authController.registerWithPhone
);

// OTP verification
router.post('/verify',
  validateVerificationCode,
  authController.verifyCode
);

// Profile management - Fixed: authenticate used as middleware, not function call
router.get('/profile',
  authenticate,
  authController.getProfile
);

// Profile routes with authentication middleware
router.put('/profile/complete', 
  authenticate, 
  authController.completeProfile
);

router.put('/profile/update', 
  authenticate, 
  authController.updateProfile
);

module.exports = router;