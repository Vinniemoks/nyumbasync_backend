const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const userController = require('../../controllers/user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateUpdateUser } = require('../../middlewares/validation');

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
  asyncHandler(userController.initiatePhoneVerification)
);

router.post('/confirm-verification',
  authenticate,
  asyncHandler(userController.confirmVerificationCode)
);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('User route error:', err);
  res.status(500).json({ error: 'User operation failed' });
});

module.exports = router;