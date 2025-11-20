/**
 * Property Controller V2
 * Enhanced property controller for core models
 */

const { Property, Contact } = require('../models');
const logger = require('../utils/logger');

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
    if (area) query['address.area'] = new RegExp(area, 'i');
    if (city) query['address.city'] = new RegExp(city, 'i');
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
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { 'address.area': new RegExp(search, 'i') }
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
    const property = await Property.create(req.body);

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
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
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
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

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
    const filters = {
      city: req.query.city,
      area: req.query.area,
      type: req.query.type,
      minRent: req.query.minRent ? parseInt(req.query.minRent) : undefined,
      maxRent: req.query.maxRent ? parseInt(req.query.maxRent) : undefined,
      bedrooms: req.query.bedrooms ? parseInt(req.query.bedrooms) : undefined,
      amenities: req.query.amenities ? req.query.amenities.split(',') : undefined
    };

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
