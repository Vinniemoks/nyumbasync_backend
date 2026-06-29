const asyncHandler = require('express-async-handler');
const subscriptionController = require('../../controllers/subscription.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

module.exports = [
  {
    method: 'GET',
    path: '/me',
    handler: [
      authenticate(['landlord', 'manager', 'agent', 'vendor']),
      asyncHandler(subscriptionController.getMySubscription),
    ],
    config: { source: 'subscription.routes' },
  },
  {
    method: 'POST',
    path: '/upgrade',
    handler: [
      authenticate(['landlord', 'manager', 'agent', 'vendor']),
      asyncHandler(subscriptionController.upgradeSubscription),
    ],
    config: { source: 'subscription.routes' },
  },
];
