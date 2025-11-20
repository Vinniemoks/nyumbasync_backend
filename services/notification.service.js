/**
 * Notification Service
 * Centralized service for sending notifications to all stakeholders
 */

const Notification = require('../models/notification.model');
const Communication = require('../models/communication.model');
const { Contact } = require('../models');
const emailService = require('./email.service');
const smsService = require('./sms.service');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Send notification to a contact
   */
  async sendNotification(data) {
    try {
      const {
        recipientId,
        recipientRole,
        type,
        priority = 'medium',
        title,
        message,
        data: notificationData = {},
        relatedEntity = null,
        channels = { inApp: true, email: false, sms: false },
        actionUrl = null,
        actionLabel = null,
        category = null
      } = data;

      // Get recipient details
      const recipient = await Contact.findById(recipientId);
      if (!recipient) {
        throw new Error('Recipient not found');
      }

      // Create notification
      const notification = await Notification.create({
        recipient: recipientId,
        recipientRole,
        type,
        priority,
        title,
        message,
        data: notificationData,
        relatedEntity,
        channels,
        actionUrl,
        actionLabel,
        category
      });

      // Send via requested channels
      const deliveryPromises = [];

      if (channels.email && recipient.email) {
        deliveryPromises.push(this.sendEmail(recipient, notification));
      }

      if (channels.sms && recipient.phone) {
        deliveryPromises.push(this.sendSMS(recipient, notification));
      }

      if (channels.push) {
        deliveryPromises.push(this.sendPushNotification(recipient, notification));
      }

      // Wait for all deliveries
      await Promise.allSettled(deliveryPromises);

      // Mark as sent
      await notification.markAsSent();

      logger.info(`Notification sent to ${recipient.email}: ${type}`);

      return notification;
    } catch (error) {
      logger.error(`Error sending notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(recipients, notificationData) {
    const promises = recipients.map(recipient =>
      this.sendNotification({
        ...notificationData,
        recipientId: recipient.id,
        recipientRole: recipient.role
      })
    );

    return Promise.allSettled(promises);
  }

  /**
   * Send email notification
   */
  async sendEmail(recipient, notification) {
    try {
      await emailService.sendEmail({
        to: recipient.email,
        subject: notification.title,
        template: this.getEmailTemplate(notification.type),
        data: {
          recipientName: recipient.firstName,
          message: notification.message,
          actionUrl: notification.actionUrl,
          actionLabel: notification.actionLabel,
          ...notification.data
        }
      });

      logger.info(`Email sent to ${recipient.email}`);
    } catch (error) {
      logger.error(`Email delivery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(recipient, notification) {
    try {
      await smsService.sendSMS({
        to: recipient.phone,
        message: `${notification.title}: ${notification.message}`
      });

      logger.info(`SMS sent to ${recipient.phone}`);
    } catch (error) {
      logger.error(`SMS delivery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send push notification
   */
  async sendPushNotification(recipient, notification) {
    // TODO: Implement push notification via Firebase/OneSignal
    logger.info(`Push notification queued for ${recipient._id}`);
  }

  /**
   * Notify landlord about tenant action
   */
  async notifyLandlord(landlordId, type, data) {
    return this.sendNotification({
      recipientId: landlordId,
      recipientRole: 'landlord',
      type,
      ...data,
      channels: { inApp: true, email: true, sms: data.priority === 'urgent' }
    });
  }

  /**
   * Notify tenant about landlord action
   */
  async notifyTenant(tenantId, type, data) {
    return this.sendNotification({
      recipientId: tenantId,
      recipientRole: 'tenant',
      type,
      ...data,
      channels: { inApp: true, email: true, sms: data.priority === 'high' || data.priority === 'urgent' }
    });
  }

  /**
   * Notify vendor about work order
   */
  async notifyVendor(vendorId, type, data) {
    return this.sendNotification({
      recipientId: vendorId,
      recipientRole: 'vendor',
      type,
      ...data,
      channels: { inApp: true, email: true, sms: true }
    });
  }

  /**
   * Notify agent about lead/showing
   */
  async notifyAgent(agentId, type, data) {
    return this.sendNotification({
      recipientId: agentId,
      recipientRole: 'agent',
      type,
      ...data,
      channels: { inApp: true, email: true, sms: data.priority === 'high' }
    });
  }

  /**
   * Notify property manager
   */
  async notifyPropertyManager(managerId, type, data) {
    return this.sendNotification({
      recipientId: managerId,
      recipientRole: 'property_manager',
      type,
      ...data,
      channels: { inApp: true, email: true }
    });
  }

  /**
   * Rent reminder notification
   */
  async sendRentReminder(tenantId, rentData) {
    return this.notifyTenant(tenantId, 'rent_reminder', {
      priority: 'high',
      title: 'Rent Payment Reminder',
      message: `Your rent of KES ${rentData.amount} is due on ${rentData.dueDate}`,
      data: rentData,
      category: 'payment',
      actionUrl: '/tenant-portal/pay-rent',
      actionLabel: 'Pay Now'
    });
  }

  /**
   * Maintenance request notification
   */
  async sendMaintenanceRequestNotification(landlordId, requestData) {
    return this.notifyLandlord(landlordId, 'maintenance_request', {
      priority: requestData.priority === 'emergency' ? 'urgent' : 'high',
      title: 'New Maintenance Request',
      message: `${requestData.category}: ${requestData.title}`,
      data: requestData,
      category: 'maintenance',
      relatedEntity: {
        entityType: 'MaintenanceRequest',
        entityId: requestData.requestId
      },
      actionUrl: `/maintenance-requests/${requestData.requestId}`,
      actionLabel: 'View Request'
    });
  }

  /**
   * Maintenance update notification
   */
  async sendMaintenanceUpdateNotification(tenantId, updateData) {
    return this.notifyTenant(tenantId, 'maintenance_update', {
      priority: 'medium',
      title: 'Maintenance Request Update',
      message: updateData.message,
      data: updateData,
      category: 'maintenance',
      relatedEntity: {
        entityType: 'MaintenanceRequest',
        entityId: updateData.requestId
      },
      actionUrl: `/tenant-portal/maintenance/${updateData.requestId}`,
      actionLabel: 'View Details'
    });
  }

  /**
   * Application received notification
   */
  async sendApplicationReceivedNotification(landlordId, applicationData) {
    return this.notifyLandlord(landlordId, 'new_application', {
      priority: 'high',
      title: 'New Rental Application',
      message: `Application received from ${applicationData.applicantName}`,
      data: applicationData,
      category: 'lease',
      actionUrl: `/tenant-journey/${applicationData.contactId}`,
      actionLabel: 'Review Application'
    });
  }

  /**
   * Lease expiring notification
   */
  async sendLeaseExpiringNotification(tenantId, leaseData) {
    return this.notifyTenant(tenantId, 'lease_expiring', {
      priority: 'high',
      title: 'Lease Expiring Soon',
      message: `Your lease expires on ${leaseData.endDate}. Please contact us to discuss renewal.`,
      data: leaseData,
      category: 'lease',
      actionUrl: '/tenant-portal/lease',
      actionLabel: 'View Lease'
    });
  }

  /**
   * Work order assigned notification
   */
  async sendWorkOrderAssignedNotification(vendorId, workOrderData) {
    return this.notifyVendor(vendorId, 'work_order_assigned', {
      priority: workOrderData.priority === 'emergency' ? 'urgent' : 'high',
      title: 'New Work Order Assigned',
      message: `${workOrderData.category}: ${workOrderData.description}`,
      data: workOrderData,
      category: 'maintenance',
      actionUrl: `/vendor/work-orders/${workOrderData.requestId}`,
      actionLabel: 'View Work Order'
    });
  }

  /**
   * Payment received notification
   */
  async sendPaymentReceivedNotification(landlordId, paymentData) {
    return this.notifyLandlord(landlordId, 'rent_received', {
      priority: 'medium',
      title: 'Payment Received',
      message: `Rent payment of KES ${paymentData.amount} received from ${paymentData.tenantName}`,
      data: paymentData,
      category: 'payment',
      actionUrl: `/transactions/${paymentData.transactionId}`,
      actionLabel: 'View Transaction'
    });
  }

  /**
   * Get email template name based on notification type
   */
  getEmailTemplate(type) {
    const templates = {
      rent_reminder: 'rent-reminder',
      rent_overdue: 'rent-overdue',
      maintenance_request: 'maintenance-request-landlord',
      maintenance_update: 'maintenance-update-tenant',
      maintenance_scheduled: 'maintenance-scheduled',
      maintenance_completed: 'maintenance-completed',
      new_application: 'application-received',
      lease_expiring: 'lease-expiring',
      work_order_assigned: 'work-order-assigned',
      rent_received: 'payment-received',
      lease_signed: 'lease-signed',
      move_in_reminder: 'move-in-reminder',
      move_out_reminder: 'move-out-reminder'
    };

    return templates[type] || 'generic-notification';
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: 'read'
    });

    logger.info(`Cleaned up ${result.deletedCount} old notifications`);
    return result;
  }
}

module.exports = new NotificationService();
