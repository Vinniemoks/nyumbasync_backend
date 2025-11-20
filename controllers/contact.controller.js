/**
 * Contact Controller
 * Handles all contact-related operations
 */

const { Contact, Property, Transaction } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all contacts with filtering and pagination
 * GET /api/contacts
 */
exports.getAllContacts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      status,
      tag,
      assignedTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Apply filters
    if (role) query.primaryRole = role;
    if (status) query.status = status;
    if (tag) query.tags = tag;
    if (assignedTo) query.assignedTo = assignedTo;

    // Search
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .populate('assignedTo', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error getting contacts: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single contact by ID
 * GET /api/contacts/:id
 */
exports.getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('assignedTo', 'firstName lastName email phone')
      .populate('relatedProperties.property', 'title address rent status')
      .populate('relatedTransactions');

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    logger.error(`Error getting contact: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Create new contact
 * POST /api/contacts
 */
exports.createContact = async (req, res) => {
  try {
    const contact = await Contact.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error creating contact: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update contact
 * PUT /api/contacts/:id
 */
exports.updateContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error updating contact: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete contact
 * DELETE /api/contacts/:id
 */
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting contact: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add tag to contact
 * POST /api/contacts/:id/tags
 */
exports.addTag = async (req, res) => {
  try {
    const { tag } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.addTag(tag);

    res.json({
      success: true,
      message: 'Tag added successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error adding tag: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Remove tag from contact
 * DELETE /api/contacts/:id/tags/:tag
 */
exports.removeTag = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.removeTag(req.params.tag);

    res.json({
      success: true,
      message: 'Tag removed successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error removing tag: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add interaction to contact
 * POST /api/contacts/:id/interactions
 */
exports.addInteraction = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.addInteraction({
      ...req.body,
      recordedBy: req.user?._id
    });

    res.json({
      success: true,
      message: 'Interaction added successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error adding interaction: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Link contact to property
 * POST /api/contacts/:id/properties
 */
exports.linkProperty = async (req, res) => {
  try {
    const { propertyId, relationship, notes } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.linkProperty(propertyId, relationship, notes);

    res.json({
      success: true,
      message: 'Property linked successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error linking property: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update buyer status
 * PUT /api/contacts/:id/buyer-status
 */
exports.updateBuyerStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.updateBuyerStatus(status);

    res.json({
      success: true,
      message: 'Buyer status updated successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error updating buyer status: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Schedule follow-up
 * POST /api/contacts/:id/follow-up
 */
exports.scheduleFollowUp = async (req, res) => {
  try {
    const { date, notes } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.setNextFollowUp(new Date(date), notes);

    res.json({
      success: true,
      message: 'Follow-up scheduled successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error scheduling follow-up: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get hot leads
 * GET /api/contacts/hot-leads
 */
exports.getHotLeads = async (req, res) => {
  try {
    const hotLeads = await Contact.findHotLeads();

    res.json({
      success: true,
      count: hotLeads.length,
      data: hotLeads
    });
  } catch (error) {
    logger.error(`Error getting hot leads: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get overdue follow-ups
 * GET /api/contacts/overdue-followups
 */
exports.getOverdueFollowUps = async (req, res) => {
  try {
    const { assignedTo } = req.query;
    const overdueContacts = await Contact.findOverdueFollowUps(assignedTo);

    res.json({
      success: true,
      count: overdueContacts.length,
      data: overdueContacts
    });
  } catch (error) {
    logger.error(`Error getting overdue follow-ups: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get contacts by tag
 * GET /api/contacts/by-tag/:tag
 */
exports.getContactsByTag = async (req, res) => {
  try {
    const contacts = await Contact.findByTag(req.params.tag);

    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    logger.error(`Error getting contacts by tag: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Search contacts
 * GET /api/contacts/search
 */
exports.searchContacts = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const contacts = await Contact.searchContacts(q);

    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    logger.error(`Error searching contacts: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get contact statistics
 * GET /api/contacts/stats
 */
exports.getContactStats = async (req, res) => {
  try {
    const stats = await Contact.getContactStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting contact stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get tenant portal users
 * GET /api/contacts/tenant-portal-users
 */
exports.getTenantPortalUsers = async (req, res) => {
  try {
    const { emailVerified, profileCompleted } = req.query;
    
    const filters = {};
    if (emailVerified !== undefined) {
      filters.emailVerified = emailVerified === 'true';
    }
    if (profileCompleted !== undefined) {
      filters.profileCompleted = profileCompleted === 'true';
    }

    const users = await Contact.findTenantPortalUsers(filters);

    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    logger.error(`Error getting tenant portal users: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Enable portal access for a contact
 * POST /api/contacts/:id/enable-portal
 */
exports.enablePortalAccess = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.enablePortalAccess(email, phone);

    res.json({
      success: true,
      message: 'Portal access enabled successfully',
      data: contact
    });
  } catch (error) {
    logger.error(`Error enabling portal access: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
