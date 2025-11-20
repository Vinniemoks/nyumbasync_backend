/**
 * Data Actions for Flow Engine
 */

const logger = require('../../utils/logger');
const { Property, Contact, Transaction } = require('../../models');

/**
 * Add tag to contact action
 */
async function addContactTag(params, eventData) {
  const { contactId, tag } = params;

  if (!contactId || !tag) {
    throw new Error('Add tag requires "contactId" and "tag" parameters');
  }

  logger.info(`🏷️  Adding tag "${tag}" to contact: ${contactId}`);

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    await contact.addTag(tag);

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      tag
    };
  } catch (error) {
    logger.error(`Failed to add tag: ${error.message}`);
    throw error;
  }
}

/**
 * Update contact status action
 */
async function updateContactStatus(params, eventData) {
  const { contactId, status } = params;

  if (!contactId || !status) {
    throw new Error('Update status requires "contactId" and "status" parameters');
  }

  logger.info(`📊 Updating contact status to "${status}": ${contactId}`);

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    if (contact.buyerProfile) {
      await contact.updateBuyerStatus(status);
    } else {
      contact.status = status;
      await contact.save();
    }

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      newStatus: status
    };
  } catch (error) {
    logger.error(`Failed to update status: ${error.message}`);
    throw error;
  }
}

/**
 * Link contact to property action
 */
async function linkContactToProperty(params, eventData) {
  const { contactId, propertyId, relationship, notes } = params;

  if (!contactId || !propertyId || !relationship) {
    throw new Error('Link requires "contactId", "propertyId", and "relationship" parameters');
  }

  logger.info(`🔗 Linking contact ${contactId} to property ${propertyId} as ${relationship}`);

  try {
    const contact = await Contact.findById(contactId);
    const property = await Property.findById(propertyId);

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }
    if (!property) {
      throw new Error(`Property not found: ${propertyId}`);
    }

    await contact.linkProperty(propertyId, relationship, notes);
    await property.linkContact(contactId, relationship, notes);

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      propertyId,
      propertyTitle: property.title,
      relationship
    };
  } catch (error) {
    logger.error(`Failed to link contact to property: ${error.message}`);
    throw error;
  }
}

/**
 * Add interaction to contact action
 */
async function addContactInteraction(params, eventData) {
  const { contactId, type, subject, notes, nextAction, nextActionDate } = params;

  if (!contactId || !type) {
    throw new Error('Interaction requires "contactId" and "type" parameters');
  }

  logger.info(`💬 Adding ${type} interaction to contact: ${contactId}`);

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    await contact.addInteraction({
      type,
      subject,
      notes,
      nextAction,
      nextActionDate: nextActionDate ? new Date(nextActionDate) : undefined
    });

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      interactionType: type
    };
  } catch (error) {
    logger.error(`Failed to add interaction: ${error.message}`);
    throw error;
  }
}

/**
 * Move transaction to stage action
 */
async function moveTransactionStage(params, eventData) {
  const { transactionId, stage, notes } = params;

  if (!transactionId || !stage) {
    throw new Error('Move stage requires "transactionId" and "stage" parameters');
  }

  logger.info(`➡️  Moving transaction ${transactionId} to stage: ${stage}`);

  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    await transaction.moveToStage(stage, notes);

    return {
      success: true,
      transactionId,
      newStage: stage,
      probability: transaction.pipeline.probability
    };
  } catch (error) {
    logger.error(`Failed to move transaction stage: ${error.message}`);
    throw error;
  }
}

/**
 * Create saved search for contact action
 */
async function createSavedSearch(params, eventData) {
  const { contactId, searchName, filters, alertFrequency } = params;

  if (!contactId || !searchName || !filters) {
    throw new Error('Saved search requires "contactId", "searchName", and "filters" parameters');
  }

  logger.info(`🔍 Creating saved search "${searchName}" for contact: ${contactId}`);

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    if (!contact.buyerProfile) {
      contact.buyerProfile = {};
    }

    if (!contact.buyerProfile.savedSearches) {
      contact.buyerProfile.savedSearches = [];
    }

    contact.buyerProfile.savedSearches.push({
      name: searchName,
      filters,
      alertFrequency: alertFrequency || 'daily',
      createdAt: new Date()
    });

    await contact.save();

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      searchName,
      alertFrequency: alertFrequency || 'daily'
    };
  } catch (error) {
    logger.error(`Failed to create saved search: ${error.message}`);
    throw error;
  }
}

module.exports = {
  addContactTag,
  updateContactStatus,
  linkContactToProperty,
  addContactInteraction,
  moveTransactionStage,
  createSavedSearch
};
