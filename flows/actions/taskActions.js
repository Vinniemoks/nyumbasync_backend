/**
 * Task Actions for Flow Engine
 */

const logger = require('../../utils/logger');
const { Transaction, Contact } = require('../../models');

/**
 * Create task action
 */
async function createTask(params, eventData) {
  const { title, description, dueDate, priority, assignedTo, transactionId } = params;

  if (!title) {
    throw new Error('Task requires "title" parameter');
  }

  logger.info(`✅ Creating task: ${title}`);

  try {
    if (transactionId) {
      // Add task to transaction
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      await transaction.addTask({
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority: priority || 'medium',
        assignedTo
      });

      return {
        success: true,
        taskTitle: title,
        transactionId,
        assignedTo
      };
    } else {
      // Create standalone task (would integrate with task management system)
      return {
        success: true,
        taskTitle: title,
        message: 'Standalone task created'
      };
    }
  } catch (error) {
    logger.error(`Failed to create task: ${error.message}`);
    throw error;
  }
}

/**
 * Create milestone action
 */
async function createMilestone(params, eventData) {
  const { name, dueDate, transactionId, assignedTo } = params;

  if (!name || !transactionId) {
    throw new Error('Milestone requires "name" and "transactionId" parameters');
  }

  logger.info(`🎯 Creating milestone: ${name}`);

  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    await transaction.addMilestone(
      name,
      dueDate ? new Date(dueDate) : undefined,
      assignedTo
    );

    return {
      success: true,
      milestoneName: name,
      transactionId,
      dueDate
    };
  } catch (error) {
    logger.error(`Failed to create milestone: ${error.message}`);
    throw error;
  }
}

/**
 * Schedule follow-up action
 */
async function scheduleFollowUp(params, eventData) {
  const { contactId, date, notes } = params;

  if (!contactId || !date) {
    throw new Error('Follow-up requires "contactId" and "date" parameters');
  }

  logger.info(`📅 Scheduling follow-up for contact: ${contactId}`);

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    await contact.setNextFollowUp(new Date(date), notes);

    return {
      success: true,
      contactId,
      contactName: contact.fullName,
      followUpDate: date
    };
  } catch (error) {
    logger.error(`Failed to schedule follow-up: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createTask,
  createMilestone,
  scheduleFollowUp
};
