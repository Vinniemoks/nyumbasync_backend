/**
 * Transaction Controller V2
 * Enhanced transaction controller for core models
 */

const { Transaction, Property, Contact } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all transactions with filtering and pagination
 * GET /api/v2/transactions
 */
exports.getAllTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      dealType,
      stage,
      status,
      property,
      contact,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Apply filters
    if (dealType) query.dealType = dealType;
    if (stage) query['pipeline.stage'] = stage;
    if (status) query.status = status;
    if (property) query.property = property;
    if (contact) query['contacts.contact'] = contact;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('property', 'title address rent status')
        .populate('contacts.contact', 'firstName lastName email phone primaryRole')
        .populate('tasks.assignedTo', 'firstName lastName email')
        .populate('milestones.assignedTo', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error getting transactions: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single transaction by ID
 * GET /api/v2/transactions/:id
 */
exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('property')
      .populate('contacts.contact')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('milestones.assignedTo', 'firstName lastName email')
      .populate('notes.createdBy', 'firstName lastName email');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error(`Error getting transaction: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Create new transaction
 * POST /api/v2/transactions
 */
exports.createTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error creating transaction: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update transaction
 * PUT /api/v2/transactions/:id
 */
exports.updateTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error updating transaction: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete transaction
 * DELETE /api/v2/transactions/:id
 */
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndDelete(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting transaction: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Move transaction to new stage
 * PUT /api/v2/transactions/:id/stage
 */
exports.moveToStage = async (req, res) => {
  try {
    const { stage, notes } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.moveToStage(stage, notes);

    res.json({
      success: true,
      message: 'Transaction stage updated',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error moving stage: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add milestone to transaction
 * POST /api/v2/transactions/:id/milestones
 */
exports.addMilestone = async (req, res) => {
  try {
    const { name, dueDate, assignedTo } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.addMilestone(name, new Date(dueDate), assignedTo);

    res.json({
      success: true,
      message: 'Milestone added successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error adding milestone: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Complete milestone
 * PUT /api/v2/transactions/:id/milestones/:milestoneName/complete
 */
exports.completeMilestone = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.completeMilestone(req.params.milestoneName);

    res.json({
      success: true,
      message: 'Milestone completed',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error completing milestone: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add task to transaction
 * POST /api/v2/transactions/:id/tasks
 */
exports.addTask = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const taskData = {
      ...req.body,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined
    };

    await transaction.addTask(taskData);

    res.json({
      success: true,
      message: 'Task added successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error adding task: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Complete task
 * PUT /api/v2/transactions/:id/tasks/:taskId/complete
 */
exports.completeTask = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.completeTask(req.params.taskId);

    res.json({
      success: true,
      message: 'Task completed',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error completing task: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add document to transaction
 * POST /api/v2/transactions/:id/documents
 */
exports.addDocument = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const documentData = {
      ...req.body,
      uploadedBy: req.user?._id
    };

    await transaction.addDocument(documentData);

    res.json({
      success: true,
      message: 'Document added successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error adding document: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add note to transaction
 * POST /api/v2/transactions/:id/notes
 */
exports.addNote = async (req, res) => {
  try {
    const { content, isPrivate } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.addNote(content, req.user?._id, isPrivate);

    res.json({
      success: true,
      message: 'Note added successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error adding note: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add contact to transaction
 * POST /api/v2/transactions/:id/contacts
 */
exports.addContact = async (req, res) => {
  try {
    const { contactId, role, isPrimary } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    await transaction.addContact(contactId, role, isPrimary);

    res.json({
      success: true,
      message: 'Contact added successfully',
      data: transaction
    });
  } catch (error) {
    logger.error(`Error adding contact: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get transactions by stage
 * GET /api/v2/transactions/by-stage/:stage
 */
exports.getTransactionsByStage = async (req, res) => {
  try {
    const transactions = await Transaction.findByStage(req.params.stage);

    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error getting transactions by stage: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get active pipeline
 * GET /api/v2/transactions/pipeline/active
 */
exports.getActivePipeline = async (req, res) => {
  try {
    const transactions = await Transaction.getActivePipeline();

    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error getting active pipeline: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get overdue transactions
 * GET /api/v2/transactions/overdue
 */
exports.getOverdueTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.getOverdueTransactions();

    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error getting overdue transactions: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get pipeline statistics
 * GET /api/v2/transactions/stats/pipeline
 */
exports.getPipelineStats = async (req, res) => {
  try {
    const stats = await Transaction.getPipelineStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`Error getting pipeline stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get transactions by contact
 * GET /api/v2/transactions/by-contact/:contactId
 */
exports.getTransactionsByContact = async (req, res) => {
  try {
    const { stage } = req.query;
    const transactions = await Transaction.findByContactId(
      req.params.contactId,
      { stage }
    );

    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error getting transactions by contact: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Generate lease verification code
 * POST /api/v2/transactions/:id/generate-verification-code
 */
exports.generateVerificationCode = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    if (transaction.dealType !== 'lease') {
      return res.status(400).json({
        success: false,
        error: 'Verification codes can only be generated for lease transactions'
      });
    }

    await transaction.generateVerificationCode();

    logger.info(`Verification code generated for transaction ${transaction._id}`);

    res.json({
      success: true,
      message: 'Verification code generated successfully',
      data: {
        verificationCode: transaction.tenantPortal.verificationCode,
        expiresAt: transaction.tenantPortal.codeExpiresAt
      }
    });
  } catch (error) {
    logger.error(`Error generating verification code: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Send tenant invitation
 * POST /api/v2/transactions/:id/send-tenant-invitation
 */
exports.sendTenantInvitation = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const transaction = await Transaction.findById(req.params.id)
      .populate('property', 'title address');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Generate code if not exists
    if (!transaction.tenantPortal?.verificationCode) {
      await transaction.generateVerificationCode();
    }

    await transaction.sendTenantInvitation(email);

    // TODO: Send invitation email with verification code
    logger.info(`Tenant invitation sent to ${email} for transaction ${transaction._id}`);

    res.json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        verificationCode: transaction.tenantPortal.verificationCode,
        invitationEmail: email
      }
    });
  } catch (error) {
    logger.error(`Error sending tenant invitation: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get lease by verification code
 * GET /api/v2/transactions/by-verification-code/:code
 */
exports.getLeaseByVerificationCode = async (req, res) => {
  try {
    const { code } = req.params;

    const transaction = await Transaction.findByVerificationCode(code);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired verification code'
      });
    }

    res.json({
      success: true,
      data: {
        id: transaction._id,
        property: transaction.property,
        stage: transaction.pipeline.stage,
        contacts: transaction.contacts
      }
    });
  } catch (error) {
    logger.error(`Error getting lease by verification code: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
