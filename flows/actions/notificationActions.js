/**
 * Notification Actions for Flows
 * Sends notifications through the notification service
 */

const notificationService = require('../../services/notification.service');
const logger = require('../../utils/logger');

/**
 * Send notification action
 * @param {Object} actionConfig - Notification configuration
 * @param {Object} context - Flow execution context
 */
async function sendNotificationAction(actionConfig, context) {
  try {
    const {
      recipientId,
      recipientRole,
      notificationType,
      priority = 'medium',
      title,
      message,
      data = {},
      relatedEntity = null,
      channels = { inApp: true, email: false, sms: false },
      actionUrl = null,
      actionLabel = null,
      category = null
    } = actionConfig;

    // Resolve template variables
    const resolvedRecipientId = resolveVariable(recipientId, context);
    const resolvedTitle = resolveVariable(title, context);
    const resolvedMessage = resolveVariable(message, context);
    const resolvedActionUrl = actionUrl ? resolveVariable(actionUrl, context) : null;

    // Send notification
    const notification = await notificationService.sendNotification({
      recipientId: resolvedRecipientId,
      recipientRole,
      type: notificationType,
      priority,
      title: resolvedTitle,
      message: resolvedMessage,
      data,
      relatedEntity,
      channels,
      actionUrl: resolvedActionUrl,
      actionLabel,
      category
    });

    logger.info(`Notification sent via flow: ${notificationType} to ${resolvedRecipientId}`);

    return {
      success: true,
      notificationId: notification._id
    };
  } catch (error) {
    logger.error(`Notification action failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Resolve template variables in strings
 */
function resolveVariable(value, context) {
  if (typeof value !== 'string') return value;

  // Replace {{variable}} with actual values from context
  return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.');
    let result = context;

    for (const key of keys) {
      if (result && typeof result === 'object') {
        result = result[key];
      } else {
        return match; // Return original if path not found
      }
    }

    return result !== undefined ? result : match;
  });
}

module.exports = sendNotificationAction;
