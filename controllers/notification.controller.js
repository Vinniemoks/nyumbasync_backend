const Notification = require('../models/notification.model');
const logger = require('../utils/logger');

// Get all notifications
exports.getAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const notifications = await Notification.find({ user: userId })
      .sort('-createdAt')
      .limit(50);
    
    res.json(notifications);
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// Get notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement notification retrieval by ID
    res.json({ id, title: 'Notification', message: 'Message', read: false });
  } catch (error) {
    logger.error('Error fetching notification:', error);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
};

// Get user notifications
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const notifications = await Notification.find({ user: userId })
      .sort('-createdAt')
      .limit(100);
    
    res.json(notifications);
  } catch (error) {
    logger.error('Error fetching user notifications:', error);
    res.status(500).json({ error: 'Failed to fetch user notifications' });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const count = await Notification.getUnreadCount(userId);
    
    res.json({ count });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

// Mark as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;
    
    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    await notification.markAsRead();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await Notification.updateMany(
      { user: userId, status: { $in: ['sent', 'delivered'] } },
      { status: 'read', readAt: new Date() }
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    // TODO: Implement notification deletion
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// Delete all notifications
exports.deleteAllNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement delete all notifications
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting all notifications:', error);
    res.status(500).json({ error: 'Failed to delete all notifications' });
  }
};

// Get preferences
exports.getPreferences = async (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement get preferences
    res.json({
      email: true,
      sms: false,
      push: true,
      categories: {
        payments: true,
        maintenance: true,
        messages: true
      }
    });
  } catch (error) {
    logger.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
};

// Update preferences
exports.updatePreferences = async (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement update preferences
    res.json({ success: true, preferences: req.body });
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
};

// Register push token
exports.registerPushToken = async (req, res) => {
  try {
    const { userId, token } = req.body;
    // TODO: Implement push token registration
    res.json({ success: true });
  } catch (error) {
    logger.error('Error registering push token:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
};

// Send notification
exports.sendNotification = async (req, res) => {
  try {
    const { userId, title, message, type } = req.body;
    // TODO: Implement send notification
    res.json({ success: true });
  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
};

module.exports = exports;
