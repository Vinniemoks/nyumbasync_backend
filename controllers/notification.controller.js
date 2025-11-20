/**
 * Notification Controller
 * Handles notification operations for all stakeholders
 */

const Notification = require('../models/notification.model');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

/**
 * Get all notifications for authenticated user
 * GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      category
    } = req.query;

    const contactId = req.user?._id || req.tenantContact?._id;

    const options = {
      unreadOnly: unreadOnly === 'true',
      type,
      category,
      limit: parseInt(limit)
    };

    const notifications = await Notification.getByRecipient(contactId, options);
    const unreadCount = await Notification.getUnreadCount(contactId);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    logger.error(`Error getting notifications: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single notification
 * GET /api/notifications/:id
 */
exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)
      .populate('relatedEntity.entityId');

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error(`Error getting notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    logger.error(`Error marking notification as read: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/mark-all-read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const result = await Notification.markAllAsRead(contactId);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: result
    });
  } catch (error) {
    logger.error(`Error marking all as read: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get unread count
 * GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const count = await Notification.getUnreadCount(contactId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error(`Error getting unread count: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Send test notification (admin only)
 * POST /api/notifications/test
 */
exports.sendTestNotification = async (req, res) => {
  try {
    const { recipientId, type, title, message } = req.body;

    const notification = await notificationService.sendNotification({
      recipientId,
      recipientRole: 'tenant',
      type: type || 'system_alert',
      priority: 'medium',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      channels: { inApp: true, email: true, sms: false }
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      data: notification
    });
  } catch (error) {
    logger.error(`Error sending test notification: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = exports;
