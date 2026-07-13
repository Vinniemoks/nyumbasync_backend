/**
 * Notification Routes
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { optionalTenantAuth } = require('../middlewares/tenant-portal-auth.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

// Apply optional auth to allow both landlord and tenant access
router.use(optionalTenantAuth);

// Special routes
router.get('/unread-count', notificationController.getUnreadCount);
router.put('/mark-all-read', notificationController.markAllAsRead);
// Privileged: previously reachable anonymously via optionalTenantAuth
// (assessment C5). Require an authenticated admin.
router.post('/test', authenticate(['admin', 'super_admin']), notificationController.sendTestNotification);

// CRUD routes
router.get('/', notificationController.getNotifications);
router.get('/:id', notificationController.getNotificationById);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
