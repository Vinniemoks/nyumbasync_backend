const router = require('express').Router();
const authController = require('../../controllers/auth.controller');
const { validateKenyanPhone } = require('../../middleware/validation');

// M-Pesa phone registration
router.post('/auth/register', 
  validateKenyanPhone,
  authController.registerWithPhone
);

// OTP verification
router.post('/auth/verify', 
  validateKenyanPhone,
  authController.verifyCode
);

// Profile management
router.get('/auth/profile',
  authenticate,
  authController.getProfile
);

module.exports = router;
