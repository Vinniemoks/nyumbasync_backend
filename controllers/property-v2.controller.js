/**
 * Property Controller V2
 * Enhanced property controller for core models
 */

const { Property, Contact, User, PropertyInterest } = require('../models');
const escapeRegex = require('../utils/escape-regex');
const logger = require('../utils/logger');
const propertyNotificationService = require('../services/property-notification.service');

// Property-mutation authorization (assessment H7). Managers/admins/super_admins
// may act on any property; a landlord/agent may only act on their own.
const PROPERTY_PRIVILEGED_ROLES = ['manager', 'admin', 'super_admin'];
function canManageProperty(user, property) {
  if (!user || !property) return false;
  if (PROPERTY_PRIVILEGED_ROLES.includes(user.role)) return true;
  const ownerId = property.landlord && (property.landlord._id || property.landlord);
  const userId = user._id || user.id;
  return !!ownerId && !!userId && String(ownerId) === String(userId);
}

/**
 * Sanitize incoming utilities array.
 */
const normalizeUtilities = (utilities = []) => {
  return utilities
    .filter(u => u.name && u.name.trim())
    .map(u => ({
      name: u.name.trim(),
      amount: Math.round(parseFloat(u.amount) || 0),
      isMandatory: Boolean(u.isMandatory),
      isCustom: Boolean(u.isCustom)
    }));
};

/**
 * Sanitize incoming houses/units array. Tenant and lastPayment are carried
 * through so a full-array replace (the edit form round-trips houses) does not
 * wipe existing tenant assignments; a unit set back to 'available' is treated
 * as vacated and its tenant cleared.
 */
const UNIT_TYPES = ['studio', 'bedsitter', '1br', '2br', '3br', '4br', 'other'];
const normalizeHouses = (houses = []) => {
  return houses
    .filter(h => h.houseNumber && String(h.houseNumber).trim())
    .map(h => {
      const status = ['available', 'occupied', 'maintenance'].includes(h.status) ? h.status : 'available';
      const floor = (h.floor === '' || h.floor == null) ? undefined : parseInt(h.floor);
      const rent = (h.rent === '' || h.rent == null || isNaN(parseFloat(h.rent)))
        ? undefined
        : Math.round(parseFloat(h.rent));
      return {
        houseNumber: String(h.houseNumber).trim(),
        floor: Number.isNaN(floor) ? undefined : floor,
        number: h.number ? String(h.number).trim() : String(h.houseNumber).trim(),
        unitType: UNIT_TYPES.includes(h.unitType) ? h.unitType : undefined,
        rent,
        tenant: status !== 'available' && h.tenant ? (h.tenant._id || h.tenant) : undefined,
        lastPayment: h.lastPayment || undefined,
        status
      };
    });
};

/**
 * Get all properties with filtering and pagination
 * GET /api/v2/properties
 */
exports.getAllProperties = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      area,
      city,
      minRent,
      maxRent,
      bedrooms,
      bathrooms,
      amenities,
      landlord,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (type) query.type = type;
    if (area) query['address.area'] = new RegExp(escapeRegex(area), 'i');
    if (city) query['address.city'] = new RegExp(escapeRegex(city), 'i');
    if (landlord) query.landlord = landlord;

    // Rent range
    if (minRent || maxRent) {
      query['rent.amount'] = {};
      if (minRent) query['rent.amount'].$gte = parseInt(minRent);
      if (maxRent) query['rent.amount'].$lte = parseInt(maxRent);
    }

    // Bedrooms/Bathrooms
    if (bedrooms) query.bedrooms = parseInt(bedrooms);
    if (bathrooms) query.bathrooms = parseInt(bathrooms);

    // Amenities
    if (amenities) {
      const amenitiesList = amenities.split(',');
      query.amenities = { $all: amenitiesList };
    }

    // Search
    if (search) {
      query.$or = [
        { title: new RegExp(escapeRegex(search), 'i') },
        { description: new RegExp(escapeRegex(search), 'i') },
        { 'address.area': new RegExp(escapeRegex(search), 'i') }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [properties, total] = await Promise.all([
      Property.find(query)
        .populate('landlord', 'firstName lastName email phone')
        .populate('relatedContacts.contact', 'firstName lastName email phone')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Property.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: properties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error getting properties: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single property by ID
 * GET /api/v2/properties/:id
 */
exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'firstName lastName email phone')
      .populate('relatedContacts.contact', 'firstName lastName email phone primaryRole')
      .populate('transactionHistory');

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    res.json({
      success: true,
      data: property
    });
  } catch (error) {
    logger.error(`Error getting property: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Create new property
 * POST /api/v2/properties
 */
exports.createProperty = async (req, res) => {
  try {
    const payload = { ...req.body };

    // Enforce the authenticated landlord when not provided by an admin/manager
    if (!payload.landlord && req.user) {
      payload.landlord = req.user._id;
    }

    // Normalize financial and unit fields
    if (payload.utilities) {
      payload.utilities = normalizeUtilities(payload.utilities);
    }
    if (payload.houses) {
      payload.houses = normalizeHouses(payload.houses);
    }
    if (!payload.houses || payload.houses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one house/unit is required'
      });
    }

    // Derive availability from units
    const hasAvailableUnit = payload.houses.some(h => h.status === 'available');
    payload.status = hasAvailableUnit ? 'available' : 'occupied';
    payload.isAvailable = hasAvailableUnit;

    const property = await Property.create(payload);

    // Notify subscribed tenants about the new public listing (best-effort)
    try {
      await propertyNotificationService.notifyNewListing(property);
    } catch (notifyErr) {
      logger.error(`Post-create listing notification failed: ${notifyErr.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: property
    });
  } catch (error) {
    logger.error(`Error creating property: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update property
 * PUT /api/v2/properties/:id
 */
exports.updateProperty = async (req, res) => {
  try {
    // Ownership check first — a landlord may only edit their own property (H7).
    const existing = await Property.findById(req.params.id).select('landlord');
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    if (!canManageProperty(req.user, existing)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to modify this property' });
    }

    const payload = { ...req.body };

    // Only managers/admins may reassign a property to another landlord
    if (payload.landlord && req.user) {
      const canReassign = ['manager', 'admin', 'super_admin'].includes(req.user.role);
      if (!canReassign) {
        delete payload.landlord;
      }
    }

    if (payload.utilities) {
      payload.utilities = normalizeUtilities(payload.utilities);
    }
    if (payload.houses) {
      payload.houses = normalizeHouses(payload.houses);
      if (payload.houses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one house/unit is required'
        });
      }
      const hasAvailableUnit = payload.houses.some(h => h.status === 'available');
      payload.status = hasAvailableUnit ? 'available' : 'occupied';
      payload.isAvailable = hasAvailableUnit;
    }

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    res.json({
      success: true,
      message: 'Property updated successfully',
      data: property
    });
  } catch (error) {
    logger.error(`Error updating property: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete property
 * DELETE /api/v2/properties/:id
 */
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).select('landlord');

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Ownership check — a landlord may only delete their own property (H7).
    if (!canManageProperty(req.user, property)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this property' });
    }

    await Property.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting property: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get available properties
 * GET /api/v2/properties/available
 */
exports.getAvailableProperties = async (req, res) => {
  try {
    const filters = buildAvailabilityFilters(req.query);
    const properties = await Property.findAvailable(filters);

    res.json({
      success: true,
      count: properties.length,
      data: properties
    });
  } catch (error) {
    logger.error(`Error getting available properties: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get publicly listed properties only
 * GET /api/v2/properties/public
 */
exports.getPublicProperties = async (req, res) => {
  try {
    const filters = buildAvailabilityFilters(req.query);
    // Treat only an explicit opt-out as unlisted so legacy documents created
    // before the listing flag existed still appear publicly.
    const properties = await Property.findAvailable(filters)
      .where('listing.isListed')
      .ne(false);

    res.json({
      success: true,
      count: properties.length,
      data: properties
    });
  } catch (error) {
    logger.error(`Error getting public properties: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const buildAvailabilityFilters = (query) => ({
  city: query.city,
  area: query.area,
  type: query.type,
  minRent: query.minRent ? parseInt(query.minRent) : undefined,
  maxRent: query.maxRent ? parseInt(query.maxRent) : undefined,
  bedrooms: query.bedrooms ? parseInt(query.bedrooms) : undefined,
  amenities: query.amenities ? query.amenities.split(',') : undefined
});

/**
 * Link contact to property
 * POST /api/v2/properties/:id/contacts
 */
exports.linkContact = async (req, res) => {
  try {
    const { contactId, relationship, notes } = req.body;
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    await property.linkContact(contactId, relationship, notes);

    res.json({
      success: true,
      message: 'Contact linked successfully',
      data: property
    });
  } catch (error) {
    logger.error(`Error linking contact: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update listing price
 * PUT /api/v2/properties/:id/price
 */
exports.updateListingPrice = async (req, res) => {
  try {
    const { newPrice, reason } = req.body;
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    await property.updateListingPrice(newPrice, reason);

    res.json({
      success: true,
      message: 'Price updated successfully',
      data: property
    });
  } catch (error) {
    logger.error(`Error updating price: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Calculate investment metrics
 * POST /api/v2/properties/:id/calculate-metrics
 */
exports.calculateInvestmentMetrics = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Update investment data if provided
    if (req.body.investment) {
      Object.assign(property.investment, req.body.investment);
    }

    await property.calculateInvestmentMetrics();

    res.json({
      success: true,
      message: 'Investment metrics calculated',
      data: {
        capRate: property.investment.capRate,
        cashFlow: property.investment.cashFlow,
        roi: property.investment.roi
      }
    });
  } catch (error) {
    logger.error(`Error calculating metrics: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark property as occupied
 * POST /api/v2/properties/:id/occupy
 */
exports.markAsOccupied = async (req, res) => {
  try {
    const { tenantId, leaseStart, leaseEnd, rentDueDate } = req.body;
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    await property.markAsOccupied(
      tenantId,
      new Date(leaseStart),
      new Date(leaseEnd),
      rentDueDate
    );

    res.json({
      success: true,
      message: 'Property marked as occupied',
      data: property
    });
  } catch (error) {
    logger.error(`Error marking as occupied: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark property as available
 * POST /api/v2/properties/:id/vacate
 */
exports.markAsAvailable = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    await property.markAsAvailable();

    res.json({
      success: true,
      message: 'Property marked as available',
      data: property
    });
  } catch (error) {
    logger.error(`Error marking as available: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get properties by landlord
 * GET /api/v2/properties/by-landlord/:landlordId
 */
exports.getPropertiesByLandlord = async (req, res) => {
  try {
    const properties = await Property.findByLandlord(req.params.landlordId);

    res.json({
      success: true,
      count: properties.length,
      data: properties
    });
  } catch (error) {
    logger.error(`Error getting properties by landlord: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get area statistics
 * GET /api/v2/properties/stats/areas
 */
exports.getAreaStats = async (req, res) => {
  try {
    const stats = await Property.getAreaStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting area stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get rent statistics
 * GET /api/v2/properties/stats/rent
 */
exports.getRentStats = async (req, res) => {
  try {
    const stats = await Property.getRentStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting rent stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get a property for public/tenant viewing
 * GET /api/v2/properties/:id/public
 */
exports.getPublicPropertyById = async (req, res) => {
  try {
    const property = await Property.findOne({
      _id: req.params.id,
      'listing.isListed': true,
      status: 'available',
      isAvailable: true
    }).populate('landlord', 'firstName lastName email');

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found or not publicly listed'
      });
    }

    await property.incrementViews();

    res.json({
      success: true,
      data: property
    });
  } catch (error) {
    logger.error(`Error getting public property: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Express interest in a property
 * POST /api/v2/properties/:id/interest
 */
exports.expressInterest = async (req, res) => {
  try {
    const { message, preferredMoveInDate } = req.body;
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'firstName lastName email phone');

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    if (!property.listing?.isListed || property.status !== 'available') {
      return res.status(400).json({
        success: false,
        error: 'This property is not available for interest'
      });
    }

    const tenantId = req.user._id;

    const interest = await PropertyInterest.create({
      property: property._id,
      tenant: tenantId,
      message: message ? String(message).trim() : undefined,
      preferredMoveInDate: preferredMoveInDate ? new Date(preferredMoveInDate) : undefined
    });

    // Notify landlord and internal staff
    try {
      await propertyNotificationService.notifyInterest({
        property,
        tenant: req.user,
        interest
      });
    } catch (notifyErr) {
      logger.error(`Interest notification failed: ${notifyErr.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Your interest has been recorded. The landlord will be in touch.',
      data: interest
    });
  } catch (error) {
    logger.error(`Error expressing interest: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
