/**
 * SMS Actions for Flow Engine
 */

const logger = require('../../utils/logger');
const smsService = require('../../services/sms.service');

/**
 * Send SMS action
 */
async function sendSMS(params, eventData) {
  const { to, message } = params;

  if (!to || !message) {
    throw new Error('SMS requires "to" and "message" parameters');
  }

  logger.info(`📱 Sending SMS to: ${to}`);

  try {
    const result = await smsService.sendSMS({
      to,
      message
    });

    return {
      success: true,
      messageId: result.messageId,
      to
    };
  } catch (error) {
    logger.error(`Failed to send SMS: ${error.message}`);
    throw error;
  }
}

/**
 * Send SMS notification action
 */
async function sendSMSNotification(params, eventData) {
  const { to, template, variables } = params;

  if (!to || !template) {
    throw new Error('SMS notification requires "to" and "template" parameters');
  }

  // Replace variables in template
  let message = template;
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
  }

  logger.info(`📱 Sending SMS notification to: ${to}`);

  try {
    const result = await smsService.sendSMS({
      to,
      message
    });

    return {
      success: true,
      messageId: result.messageId,
      to,
      message
    };
  } catch (error) {
    logger.error(`Failed to send SMS notification: ${error.message}`);
    throw error;
  }
}

module.exports = {
  sendSMS,
  sendSMSNotification
};
