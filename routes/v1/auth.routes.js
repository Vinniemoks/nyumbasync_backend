const router = require('express').Router();
const authController = require('../../controllers/auth.controller');
const { 
  validatePhoneRegistration,
  validateVerificationCode 
} = require('../../middlewares/validation');
const { authenticate } = require('../../middlewares/auth.middleware'); // Import authenticate specifically


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

// Profile management - THIS IS LINE 22 THAT'S CAUSING THE ERROR
router.get('/profile',
  authenticate(),
  authController.getProfile // Make sure this exists in your controller
);

// Use authenticate middleware directly
router.put('/profile/complete', authenticate(), authController.completeProfile);
router.put('/profile/update', authenticate(), authController.updateProfile);

module.exports = router;