const { User, Contact } = require('../models');
const emailService = require('./email.service');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

const APP_URL = process.env.FRONTEND_URL || 'https://nyumbasync.co.ke';

class PropertyNotificationService {
  /**
   * Notify landlord and internal staff when a tenant expresses interest.
   * @param {Object} options
   * @param {Property} options.property - populated property document
   * @param {User} options.tenant - authenticated tenant user
   * @param {PropertyInterest} options.interest - created interest document
   */
  async notifyInterest({ property, tenant, interest }) {
    const landlord = property.landlord;
    if (!landlord || !landlord.email) {
      logger.warn(`No landlord email for property ${property._id}`);
      return;
    }

    const propertyUrl = `${APP_URL}/properties/${property._id}`;
    const publicUrl = `${APP_URL}/listings/${property._id}`;

    const commonData = {
      subject: 'New Tenant Interest - NyumbaSync',
      emailSubject: 'New Tenant Interest - NyumbaSync',
      propertyTitle: property.title,
      propertyAddress: this._formatAddress(property.address),
      propertyRent: property.rent?.amount,
      propertyUtilities: (property.utilities || []).map(u => ({
        name: u.name,
        amount: u.amount
      })),
      tenantName: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.email,
      tenantEmail: tenant.email,
      tenantPhone: tenant.phone || 'Not provided',
      message: interest.message || 'No additional message',
      preferredMoveInDate: interest.preferredMoveInDate
        ? new Date(interest.preferredMoveInDate).toLocaleDateString('en-KE')
        : 'Not specified',
      propertyUrl,
      publicUrl,
      appUrl: APP_URL,
      year: new Date().getFullYear()
    };

    // 1. Email landlord
    await emailService.sendEmail(
      landlord.email,
      'New Tenant Interest - NyumbaSync',
      'property-interest-landlord',
      {
        ...commonData,
        recipientName: landlord.firstName || 'Landlord'
      }
    );

    // 2. Email internal staff (managers, admins, super_admins)
    const staff = await User.find({
      role: { $in: ['manager', 'admin', 'super_admin'] },
      status: 'active'
    }).select('firstName lastName email').lean();

    for (const member of staff) {
      try {
        await emailService.sendEmail(
          member.email,
          'Tenant Interest Alert - NyumbaSync',
          'property-interest-staff',
          {
            ...commonData,
            recipientName: member.firstName || 'Team Member',
            landlordName: `${landlord.firstName || ''} ${landlord.lastName || ''}`.trim() || landlord.email
          }
        );
      } catch (err) {
        logger.error(`Failed to email staff ${member.email}: ${err.message}`);
      }
    }

    // 3. In-app notifications (best-effort; requires a Contact record)
    await this._createInAppNotification(landlord, 'landlord', commonData, property);
    for (const member of staff) {
      await this._createInAppNotification(member, 'property_manager', commonData, property);
    }
  }

  /**
   * Notify subscribed tenants when a new property is listed publicly.
   * @param {Property} property - created property document
   */
  async notifyNewListing(property) {
    try {
      const isPublic = property.listing?.isListed !== false && property.isAvailable !== false;
      if (!isPublic) return;

      const tenants = await User.find({
        role: 'tenant',
        status: 'active',
        'notificationPreferences.newListings': { $ne: false }
      }).select('firstName lastName email phone').lean();

      if (!tenants.length) return;

      const propertyUrl = `${APP_URL}/properties/${property._id}`;
      const commonData = {
        subject: 'New Property Listing - NyumbaSync',
        emailSubject: 'New Property Listing - NyumbaSync',
        propertyTitle: property.title,
        propertyAddress: this._formatAddress(property.address),
        propertyRent: property.rent?.amount,
        propertyType: property.type,
        propertyUrl,
        appUrl: APP_URL,
        year: new Date().getFullYear()
      };

      for (const tenant of tenants) {
        try {
          await emailService.sendEmail(
            tenant.email,
            'New Property Listing - NyumbaSync',
            'new-listing-tenant',
            {
              ...commonData,
              recipientName: tenant.firstName || 'Tenant'
            }
          );
        } catch (err) {
          logger.error(`Failed to email tenant ${tenant.email}: ${err.message}`);
        }
      }

      // Best-effort in-app notifications
      for (const tenant of tenants) {
        await this._createInAppNotification(tenant, 'tenant', {
          ...commonData,
          tenantName: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.email
        }, property);
      }

      logger.info(`Notified ${tenants.length} tenants about new listing ${property._id}`);
    } catch (err) {
      logger.error(`New listing notification failed: ${err.message}`);
    }
  }

  _formatAddress(address) {
    if (!address) return 'Not provided';
    const parts = [
      address.street,
      address.area,
      address.city,
      address.county
    ].filter(Boolean);
    return parts.join(', ');
  }

  async _createInAppNotification(user, role, data, property) {
    try {
      const contact = await Contact.findOne({ email: user.email }).select('_id').lean();
      if (!contact) return;

      await notificationService.sendNotification({
        recipientId: contact._id,
        recipientRole: role,
        type: 'new_application',
        priority: 'high',
        title: 'New Tenant Interest',
        message: `${data.tenantName} expressed interest in ${data.propertyTitle}`,
        data: {
          propertyId: property._id,
          tenantEmail: data.tenantEmail,
          message: data.message
        },
        relatedEntity: {
          entityType: 'Property',
          entityId: property._id
        },
        channels: { inApp: true, email: false },
        actionUrl: `/properties/${property._id}`,
        actionLabel: 'View Property',
        category: 'lease'
      });
    } catch (err) {
      logger.error(`In-app interest notification failed: ${err.message}`);
    }
  }
}

module.exports = new PropertyNotificationService();
