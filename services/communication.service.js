/**
 * Communication Service
 * Manages communications between all stakeholders
 */

const Communication = require('../models/communication.model');
const { Contact } = require('../models');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

class CommunicationService {
  /**
   * Send message between stakeholders
   */
  async sendMessage(data) {
    try {
      const {
        senderId,
        senderRole,
        recipientIds,
        subject,
        body,
        messageType = 'text',
        relatedTo = null,
        propertyId = null,
        priority = 'normal',
        attachments = [],
        threadId = null
      } = data;

      // Get sender details
      const sender = await Contact.findById(senderId);
      if (!sender) {
        throw new Error('Sender not found');
      }

      // Prepare participants
      const participants = recipientIds.map(id => ({
        contact: id,
        role: null // Will be populated from Contact
      }));

      // Add sender as participant
      participants.push({
        contact: senderId,
        role: senderRole
      });

      // Create communication
      const communication = await Communication.create({
        threadId: threadId || undefined,
        participants,
        sender: senderId,
        senderRole,
        messageType,
        subject,
        body,
        attachments,
        relatedTo,
        property: propertyId,
        priority,
        status: 'sent'
      });

      // Populate participants
      await communication.populate('participants.contact', 'firstName lastName email phone');

      // Send notifications to recipients
      const notificationPromises = recipientIds.map(recipientId =>
        notificationService.sendNotification({
          recipientId,
          recipientRole: 'tenant', // Will be determined from contact
          type: 'message_received',
          priority: priority === 'urgent' ? 'high' : 'medium',
          title: subject || `New message from ${sender.fullName}`,
          message: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
          data: {
            communicationId: communication._id,
            senderId,
            senderName: sender.fullName
          },
          category: 'communication',
          channels: {
            inApp: true,
            email: priority === 'urgent',
            sms: false
          },
          actionUrl: `/messages/${communication._id}`,
          actionLabel: 'View Message'
        })
      );

      await Promise.allSettled(notificationPromises);

      logger.info(`Message sent from ${sender.email} to ${recipientIds.length} recipients`);

      return communication;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new conversation thread
   */
  async createThread(data) {
    const { participants, subject, initialMessage, propertyId, relatedTo } = data;

    const thread = await Communication.createThread({
      participants: participants.map(p => ({
        contact: p.contactId,
        role: p.role
      })),
      sender: data.senderId,
      senderRole: data.senderRole,
      subject,
      body: initialMessage,
      property: propertyId,
      relatedTo
    });

    return thread;
  }

  /**
   * Reply to a message
   */
  async replyToMessage(data) {
    const { originalMessageId, senderId, senderRole, body, attachments = [] } = data;

    // Get original message
    const originalMessage = await Communication.findById(originalMessageId);
    if (!originalMessage) {
      throw new Error('Original message not found');
    }

    // Create reply
    const reply = await Communication.create({
      threadId: originalMessage.threadId,
      participants: originalMessage.participants,
      sender: senderId,
      senderRole,
      body,
      attachments,
      inReplyTo: originalMessageId,
      relatedTo: originalMessage.relatedTo,
      property: originalMessage.property,
      status: 'sent'
    });

    // Notify all participants except sender
    const recipientIds = originalMessage.participants
      .filter(p => p.contact.toString() !== senderId.toString())
      .map(p => p.contact);

    const sender = await Contact.findById(senderId);

    const notificationPromises = recipientIds.map(recipientId =>
      notificationService.sendNotification({
        recipientId,
        recipientRole: 'tenant',
        type: 'message_received',
        priority: 'medium',
        title: `Reply from ${sender.fullName}`,
        message: body.substring(0, 100),
        data: {
          communicationId: reply._id,
          threadId: reply.threadId
        },
        category: 'communication',
        channels: { inApp: true, email: false },
        actionUrl: `/messages/${reply._id}`,
        actionLabel: 'View Reply'
      })
    );

    await Promise.allSettled(notificationPromises);

    return reply;
  }

  /**
   * Get conversation thread
   */
  async getThread(threadId, contactId) {
    const messages = await Communication.getThread(threadId);

    // Mark messages as read for this contact
    const unreadMessages = messages.filter(
      msg => !msg.readBy.some(r => r.contact.toString() === contactId.toString())
    );

    await Promise.all(
      unreadMessages.map(msg => msg.markAsRead(contactId))
    );

    return messages;
  }

  /**
   * Get all messages for a contact
   */
  async getMessagesForContact(contactId, options = {}) {
    return Communication.getByContact(contactId, options);
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(contactId) {
    return Communication.getUnreadCount(contactId);
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId, contactId) {
    const message = await Communication.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    return message.markAsRead(contactId);
  }

  /**
   * Mark all messages as read
   */
  async markAllAsRead(contactId) {
    const messages = await Communication.find({
      'participants.contact': contactId,
      'readBy.contact': { $ne: contactId }
    });

    await Promise.all(
      messages.map(msg => msg.markAsRead(contactId))
    );

    return { count: messages.length };
  }

  /**
   * Send maintenance request communication
   */
  async sendMaintenanceRequestMessage(requestData) {
    const { tenantId, landlordId, propertyId, requestId, message } = requestData;

    return this.sendMessage({
      senderId: tenantId,
      senderRole: 'tenant',
      recipientIds: [landlordId],
      subject: `Maintenance Request #${requestId}`,
      body: message,
      messageType: 'text',
      relatedTo: {
        entityType: 'MaintenanceRequest',
        entityId: requestId
      },
      propertyId,
      priority: 'high'
    });
  }

  /**
   * Send lease communication
   */
  async sendLeaseMessage(leaseData) {
    const { landlordId, tenantId, propertyId, transactionId, subject, message } = leaseData;

    return this.sendMessage({
      senderId: landlordId,
      senderRole: 'landlord',
      recipientIds: [tenantId],
      subject,
      body: message,
      messageType: 'text',
      relatedTo: {
        entityType: 'Transaction',
        entityId: transactionId
      },
      propertyId,
      priority: 'normal'
    });
  }

  /**
   * Send vendor communication
   */
  async sendVendorMessage(vendorData) {
    const { landlordId, vendorId, requestId, message, priority = 'normal' } = vendorData;

    return this.sendMessage({
      senderId: landlordId,
      senderRole: 'landlord',
      recipientIds: [vendorId],
      subject: `Work Order #${requestId}`,
      body: message,
      messageType: 'text',
      relatedTo: {
        entityType: 'MaintenanceRequest',
        entityId: requestId
      },
      priority
    });
  }

  /**
   * Broadcast message to multiple stakeholders
   */
  async broadcastMessage(data) {
    const { senderId, senderRole, recipientIds, subject, body, propertyId } = data;

    const promises = recipientIds.map(recipientId =>
      this.sendMessage({
        senderId,
        senderRole,
        recipientIds: [recipientId],
        subject,
        body,
        propertyId,
        messageType: 'text'
      })
    );

    return Promise.allSettled(promises);
  }

  /**
   * Get property communications
   */
  async getPropertyCommunications(propertyId, options = {}) {
    return Communication.getByProperty(propertyId, options);
  }

  /**
   * Search messages
   */
  async searchMessages(contactId, searchTerm) {
    return Communication.searchMessages(contactId, searchTerm);
  }

  /**
   * Delete message (soft delete)
   */
  async deleteMessage(messageId, contactId) {
    const message = await Communication.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Remove contact from participants
    message.participants = message.participants.filter(
      p => p.contact.toString() !== contactId.toString()
    );

    // If no participants left, delete the message
    if (message.participants.length === 0) {
      await message.deleteOne();
    } else {
      await message.save();
    }

    return { success: true };
  }
}

module.exports = new CommunicationService();
