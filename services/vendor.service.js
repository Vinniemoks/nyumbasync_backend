const Vendor = require('../models/vendor.model');
const { sendWhatsApp } = require('./notification.service');

class VendorService {
  async assignVendor(issueType, coordinates) {
    try {
      // 1. Find vendors in the same subcounty
      const vendors = await Vendor.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates
            },
            distanceField: 'distance',
            maxDistance: 10000, // 10km radius
            spherical: true
          }
        },
        {
          $match: {
            services: issueType,
            available: true,
            rating: { $gte: 3.5 } // Minimum rating
          }
        },
        {
          $sort: {
            responseTime: 1 // Fastest first
          }
        },
        {
          $limit: 5
        }
      ]);

      if (vendors.length === 0) {
        throw new Error('NO_VENDORS_AVAILABLE');
      }

      // 2. Notify top vendor via WhatsApp (common in Kenya)
      const assignedVendor = vendors[0];
      await sendWhatsApp(
        assignedVendor.contact,
        `New ${issueType} job assigned in ${assignedVendor.subcounty}. Reply YES to accept`
      );

      return {
        vendor: assignedVendor._id,
        responseDeadline: new Date(Date.now() + 3600000) // 1 hour to respond
      };
    } catch (error) {
      console.error('VENDOR_ASSIGNMENT_FAILED:', error);
      throw error;
    }
  }

  async trackVendorPerformance(vendorId) {
    // Implement Nairobi County vendor rating system
  }
}

module.exports = new VendorService();
