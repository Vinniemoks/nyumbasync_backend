const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const notificationController = require('../../controllers/notification.controller');

module.exports = [
  // Get all notifications
  {
    method: 'GET',
    path: '/',
    handler: [authenticate(), asyncHandler(notificationController.getAllNotifications)],
    config: { source: 'notification.routes' }
  },
  
  // Get notification by ID
  {
    method: 'GET',
    path: '/:id',
    handler: [authenticate(), asyncHandler(notificationController.getNotificationById)],
    config: { source: 'notification.routes' }
  },
  
  // Get notifications for user
  {
    method: 'GET',
    path: '/user/:userId',
    handler: [authenticate(), asyncHandler(notificationController.getUserNotifications)],
    config: { source: 'notification.routes' }
  },
  
  // Get unread notification count
  {
    method: 'GET',
    path: '/user/:userId/unread-count',
    handler: [authenticate(), asyncHandler(notificationController.getUnreadCount)],
    config: { source: 'notification.routes' }
  },
  
  // Mark notification as read
  {
    method: 'PUT',
    path: '/:notificationId/read',
    handler: [authenticate(), asyncHandler(notificationController.markAsRead)],
    config: { source: 'notification.routes' }
  },
  
  // Mark all notifications as read
  {
    method: 'PUT',
    path: '/user/:userId/read-all',
    handler: [authenticate(), asyncHandler(notificationController.markAllAsRead)],
    config: { source: 'notification.routes' }
  },
  
  // Delete notification
  {
    method: 'DELETE',
    path: '/:notificationId',
    handler: [authenticate(), asyncHandler(notificationController.deleteNotification)],
    config: { source: 'notification.routes' }
  },
  
  // Delete all notifications for user
  {
    method: 'DELETE',
    path: '/user/:userId/all',
    handler: [authenticate(), asyncHandler(notificationController.deleteAllNotifications)],
    config: { source: 'notification.routes' }
  },
  
  // Get notification preferences
  {
    method: 'GET',
    path: '/user/:userId/preferences',
    handler: [authenticate(), asyncHandler(notificationController.getPreferences)],
    config: { source: 'notification.routes' }
  },
  
  // Update notification preferences
  {
    method: 'PUT',
    path: '/user/:userId/preferences',
    handler: [authenticate(), asyncHandler(notificationController.updatePreferences)],
    config: { source: 'notification.routes' }
  },
  
  // Register push notification token
  {
    method: 'POST',
    path: '/push-token',
    handler: [authenticate(), asyncHandler(notificationController.registerPushToken)],
    config: { source: 'notification.routes' }
  },
  
  // Send notification (admin/system)
  {
    method: 'POST',
    path: '/send',
    handler: [authenticate('admin', 'manager'), asyncHandler(notificationController.sendNotification)],
    config: { source: 'notification.routes' }
  }
];
