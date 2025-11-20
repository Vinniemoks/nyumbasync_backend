/**
 * Communication Controller
 * Handles messaging between all stakeholders
 */

const communicationService = require('../services/communication.service');
const logger = require('../utils/logger');

/**
 * Send message
 * POST /api/communications
 */
exports.sendMessage = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;
    const { recipientIds, subject, body, attachments, propertyId, priority } = req.body;

    const message = await communicationService.sendMessage({
      senderId: contactId,
      senderRole: req.user?.role || 'tenant',
      recipientIds,
      subject,
      body,
      attachments,
      propertyId,
      priority
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    logger.error(`Error sending message: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all messages for user
 * GET /api/communications
 */
exports.getMessages = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;
    const { unreadOnly, limit } = req.query;

    const messages = await communicationService.getMessagesForContact(contactId, {
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit) || 50
    });

    const unreadCount = await communicationService.getUnreadCount(contactId);

    res.json({
      success: true,
      data: messages,
      unreadCount
    });
  } catch (error) {
    logger.error(`Error getting messages: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get conversation thread
 * GET /api/communications/thread/:threadId
 */
exports.getThread = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;
    const { threadId } = req.params;

    const messages = await communicationService.getThread(threadId, contactId);

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    logger.error(`Error getting thread: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Reply to message
 * POST /api/communications/:id/reply
 */
exports.replyToMessage = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;
    const { body, attachments } = req.body;

    const reply = await communicationService.replyToMessage({
      originalMessageId: req.params.id,
      senderId: contactId,
      senderRole: req.user?.role || 'tenant',
      body,
      attachments
    });

    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      data: reply
    });
  } catch (error) {
    logger.error(`Error replying to message: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark message as read
 * PUT /api/communications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const message = await communicationService.markAsRead(req.params.id, contactId);

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message
    });
  } catch (error) {
    logger.error(`Error marking message as read: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark all messages as read
 * PUT /api/communications/mark-all-read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const result = await communicationService.markAllAsRead(contactId);

    res.json({
      success: true,
      message: 'All messages marked as read',
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
 * GET /api/communications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const count = await communicationService.getUnreadCount(contactId);

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
 * Search messages
 * GET /api/communications/search
 */
exports.searchMessages = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const messages = await communicationService.searchMessages(contactId, q);

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    logger.error(`Error searching messages: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get property communications
 * GET /api/communications/property/:propertyId
 */
exports.getPropertyCommunications = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { limit } = req.query;

    const messages = await communicationService.getPropertyCommunications(propertyId, {
      limit: parseInt(limit) || 100
    });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    logger.error(`Error getting property communications: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete message
 * DELETE /api/communications/:id
 */
exports.deleteMessage = async (req, res) => {
  try {
    const contactId = req.user?._id || req.tenantContact?._id;

    const result = await communicationService.deleteMessage(req.params.id, contactId);

    res.json({
      success: true,
      message: 'Message deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error(`Error deleting message: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Broadcast message (landlord/admin only)
 * POST /api/communications/broadcast
 */
exports.broadcastMessage = async (req, res) => {
  try {
    const contactId = req.user?._id;
    const { recipientIds, subject, body, propertyId } = req.body;

    const result = await communicationService.broadcastMessage({
      senderId: contactId,
      senderRole: req.user?.role || 'landlord',
      recipientIds,
      subject,
      body,
      propertyId
    });

    res.json({
      success: true,
      message: 'Broadcast sent successfully',
      data: result
    });
  } catch (error) {
    logger.error(`Error broadcasting message: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = exports;
