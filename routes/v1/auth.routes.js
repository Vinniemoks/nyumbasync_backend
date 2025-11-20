// auth.routes.js
const asyncHandler = require('express-async-handler');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

module.exports = [
  // Login
  {
    method: 'POST',
    path: '/login',
    handler: asyncHandler(authController.login),
    config: { source: 'auth.routes' }
  },
  
  // Signup
  {
    method: 'POST',
    path: '/signup',
    handler: asyncHandler(authController.signup),
    config: { source: 'auth.routes' }
  },
  
  // Register with phone (existing)
  {
    method: 'POST',
    path: '/register',
    handler: asyncHandler(authController.registerWithPhone),
    config: { source: 'auth.routes' }
  },
  
  // Verify code (existing)
  {
    method: 'POST',
    path: '/verify',
    handler: asyncHandler(authController.verifyCode),
    config: { source: 'auth.routes' }
  },
  
  // Logout
  {
    method: 'POST',
    path: '/logout',
    handler: [authenticate(), asyncHandler(authController.logout)],
    config: { source: 'auth.routes' }
  },
  
  // Refresh token
  {
    method: 'POST',
    path: '/refresh',
    handler: asyncHandler(authController.refreshToken),
    config: { source: 'auth.routes' }
  },
  
  // Get current user
  {
    method: 'GET',
    path: '/me',
    handler: [authenticate(), asyncHandler(authController.getCurrentUser)],
    config: { source: 'auth.routes' }
  },
  
  // Get profile (existing)
  {
    method: 'GET',
    path: '/profile',
    handler: [authenticate(), asyncHandler(authController.getProfile)],
    config: { source: 'auth.routes' }
  },
  
  // Complete profile (existing)
  {
    method: 'PUT',
    path: '/profile/complete',
    handler: [authenticate(), asyncHandler(authController.completeProfile)],
    config: { source: 'auth.routes' }
  },
  
  // Update profile (existing)
  {
    method: 'PUT',
    path: '/profile',
    handler: [authenticate(), asyncHandler(authController.updateProfile)],
    config: { source: 'auth.routes' }
  },
  
  // Forgot password
  {
    method: 'POST',
    path: '/forgot-password',
    handler: asyncHandler(authController.forgotPassword),
    config: { source: 'auth.routes' }
  },
  
  // Reset password
  {
    method: 'POST',
    path: '/reset-password',
    handler: asyncHandler(authController.resetPassword),
    config: { source: 'auth.routes' }
  },
  
  // Change password
  {
    method: 'POST',
    path: '/change-password',
    handler: [authenticate(), asyncHandler(authController.changePassword)],
    config: { source: 'auth.routes' }
  },
  
  // MFA login verification (public - no auth required)
  {
    method: 'POST',
    path: '/mfa/verify-login',
    handler: asyncHandler(require('../../controllers/mfa.controller').verifyMFALogin),
    config: { source: 'auth.routes' }
  }
];