const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const SMSService = require('../../services/sms.service');
const userController = require('../../controllers/user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateUpdateUser } = require('../../middlewares/validation');

// Initialize SMS Service
const smsService = new SMSService();

// All routes wrapped in asyncHandler
router.get('/profile', 
  authenticate, 
  asyncHandler(userController.getUserProfile)
);

router.put('/profile',
  authenticate,
  validateUpdateUser,
  asyncHandler(userController.updateProfile)
);

router.get('/',
  authenticate('admin'),
  asyncHandler(userController.listUsers)
);

// Simplified parameter name from :userId to :id
router.get('/:id',
  authenticate('admin'),
  asyncHandler(userController.getUserById)
);

router.patch('/:id/status',
  authenticate('admin'),
  asyncHandler(userController.updateUserStatus)
);

router.post('/verify-phone',
  authenticate,
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    const userId = req.user._id;
    
    // Generate verification code (4-6 digits)
    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Save verification code to user record (implementation depends on your DB)
    await userController.saveVerificationCode(userId, verificationCode);
    
    // Send SMS with verification code
    const message = `Your verification code is: ${verificationCode}`;
    await smsService.sendSMS(phoneNumber, message);
    
    res.json({ 
      success: true,
      message: 'Verification code sent successfully'
    });
  })
);

router.post('/confirm-verification',
  authenticate,
  asyncHandler(async (req, res) => {
    const { verificationCode } = req.body;
    const userId = req.user._id;
    
    // Verify the code with user record
    const isVerified = await userController.verifyCode(userId, verificationCode);
    
    if (!isVerified) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid verification code' 
      });
    }
    
    // Update user's phone verification status
    await userController.markPhoneAsVerified(userId);
    
    res.json({ 
      success: true,
      message: 'Phone number verified successfully' 
    });
  })
);

// Admin notification route example
router.post('/:id/notify',
  authenticate('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;
    
    // Get user's phone number from DB
    const user = await userController.getUserById(id);
    
    if (!user.phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'User has no registered phone number'
      });
    }
    
    // Send notification SMS
    await smsService.sendSMS(user.phoneNumber, message);
    
    res.json({
      success: true,
      message: 'Notification sent successfully'
    });
  })
);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('User route error:', err);
  
  // SMS error notification to admin (optional)
  if (process.env.ADMIN_PHONE) {
    smsService.sendSMS(
      process.env.ADMIN_PHONE,
      `User Route Error: ${err.message}`
    ).catch(e => console.error('Failed to send error SMS:', e));
  }
  
  res.status(500).json({ 
    error: 'User operation failed',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;