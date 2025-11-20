/**
 * Notification Actions for Flow Engine
 */

const logger = require('../../utils/logger');

/**
 * Send push notification action
 */
async function sendPushNotification(params, eventData) {
  const { userId, title, message, data } = params;

  if (!userId || !title || !message) {
    throw new Error('Push notification requires "userId", "title", and "message" parameters');
  }

  logger.info(`🔔 Sending push notification to user: ${userId}`);

  // This would integrate with your push notification service (Firebase, OneSignal, etc.)
  // For now, we'll just log it
  return {
    success: true,
    userId,
    title,
    message,
    notificationSent: true
  };
}

/**
 * Send in-app notification action
 */
async function sendInAppNotification(params, eventData) {
  const { userId, title, message, type, link } = params;

  if (!userId || !message) {
    throw new Error('In-app notification requires "userId" and "message" parameters');
  }

  logger.info(`📬 Creating in-app notification for user: ${userId}`);

  // This would create a notification in your database
  // For now, we'll just log it
  return {
    success: true,
    userId,
    title,
    message,
    type: type || 'info',
    link
  };
}

/**
 * Send alert to agent action
 */
async function sendAgentAlert(params, eventData) {
  const { agentId, alertType, message, priority } = params;

  if (!agentId || !message) {
    throw new Error('Agent alert requires "agentId" and "message" parameters');
  }

  logger.info(`🚨 Sending alert to agent: ${agentId}`);

  return {
    success: true,
    agentId,
    alertType: alertType || 'general',
    message,
    priority: priority || 'medium',
    timestamp: new Date()
  };
}

module.exports = {
  sendPushNotification,
  sendInAppNotification,
  sendAgentAlert
};
