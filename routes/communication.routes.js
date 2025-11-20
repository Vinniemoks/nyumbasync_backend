/**
 * Communication Routes
 */

const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communication.controller');
const { optionalTenantAuth } = require('../middlewares/tenant-portal-auth.middleware');

// Apply optional auth to allow both landlord and tenant access
router.use(optionalTenantAuth);

// Special routes
router.get('/unread-count', communicationController.getUnreadCount);
router.put('/mark-all-read', communicationController.markAllAsRead);
router.get('/search', communicationController.searchMessages);
router.get('/thread/:threadId', communicationController.getThread);
router.get('/property/:propertyId', communicationController.getPropertyCommunications);
router.post('/broadcast', communicationController.broadcastMessage);

// CRUD routes
router.get('/', communicationController.getMessages);
router.post('/', communicationController.sendMessage);
router.post('/:id/reply', communicationController.replyToMessage);
router.put('/:id/read', communicationController.markAsRead);
router.delete('/:id', communicationController.deleteMessage);

module.exports = router;
