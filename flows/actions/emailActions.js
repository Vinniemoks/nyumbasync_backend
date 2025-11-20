/**
 * Email Actions for Flow Engine
 */

const logger = require('../../utils/logger');
const emailService = require('../../services/email.service');

/**
 * Send email action
 */
async function sendEmail(params, eventData) {
  const { to, subject, template, templateData, from } = params;

  if (!to || !subject) {
    throw new Error('Email requires "to" and "subject" parameters');
  }

  logger.info(`📧 Sending email to: ${to}`);

  try {
    const result = await emailService.sendEmail({
      to,
      subject,
      template,
      data: templateData,
      from
    });

    return {
      success: true,
      messageId: result.messageId,
      to
    };
  } catch (error) {
    logger.error(`Failed to send email: ${error.message}`);
    throw error;
  }
}

/**
 * Send email sequence action
 */
async function sendEmailSequence(params, eventData) {
  const { to, sequenceName, startDelay = 0 } = params;

  if (!to || !sequenceName) {
    throw new Error('Email sequence requires "to" and "sequenceName" parameters');
  }

  logger.info(`📧 Starting email sequence "${sequenceName}" for: ${to}`);

  // This would integrate with your email sequence system
  // For now, we'll just log it
  return {
    success: true,
    sequenceName,
    to,
    startDelay,
    message: 'Email sequence scheduled'
  };
}

/**
 * Send template email action
 */
async function sendTemplateEmail(params, eventData) {
  const { to, templateId, variables } = params;

  if (!to || !templateId) {
    throw new Error('Template email requires "to" and "templateId" parameters');
  }

  logger.info(`📧 Sending template email (${templateId}) to: ${to}`);

  try {
    const result = await emailService.sendTemplateEmail({
      to,
      templateId,
      variables
    });

    return {
      success: true,
      messageId: result.messageId,
      templateId,
      to
    };
  } catch (error) {
    logger.error(`Failed to send template email: ${error.message}`);
    throw error;
  }
}

module.exports = {
  sendEmail,
  sendEmailSequence,
  sendTemplateEmail
};
