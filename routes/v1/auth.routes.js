// auth.routes.js
const asyncHandler = require('express-async-handler');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

module.exports = [
  {
    method: 'POST',
    path: '/register',
    handler: asyncHandler(authController.registerWithPhone),
    config: { source: 'auth.routes' }
  },
  {
    method: 'POST',
    path: '/verify',
    handler: asyncHandler(authController.verifyCode),
    config: { source: 'auth.routes' }
  },
  {
    method: 'GET',
    path: '/profile',
    handler: [authenticate, asyncHandler(authController.getProfile)],
    config: { source: 'auth.routes' }
  },
  {
    method: 'PUT',
    path: '/profile/complete',
    handler: [authenticate, asyncHandler(authController.completeProfile)],
    config: { source: 'auth.routes' }
  },
  {
    method: 'PUT',
    path: '/profile',
    handler: [authenticate, asyncHandler(authController.updateProfile)],
    config: { source: 'auth.routes' }
  }
];