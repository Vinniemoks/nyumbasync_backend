/**
 * Model Event Emitters
 * Integrates Mongoose models with the Flow Engine
 */

const flowEngine = require('./FlowEngine');
const { Property, Contact, Transaction } = require('../models');
const logger = require('../utils/logger');

/**
 * Setup event emitters for all models
 */
function setupModelEvents() {
  logger.info('🔌 Setting up model event emitters...');

  setupContactEvents();
  setupPropertyEvents();
  setupTransactionEvents();

  logger.info('✅ Model event emitters configured');
}

/**
 * Setup Contact model events
 */
function setupContactEvents() {
  // Contact created
  Contact.schema.post('save', function(doc, next) {
    if (this.isNew) {
      flowEngine.triggerEvent('contact.created', {
        contact: doc.toObject(),
        contactId: doc._id,
        primaryRole: doc.primaryRole,
        tags: doc.tags
      });
    }
    next();
  });

  // Contact updated
  Contact.schema.post('findOneAndUpdate', async function(doc) {
    if (doc) {
      flowEngine.triggerEvent('contact.updated', {
        contact: doc.toObject(),
        contactId: doc._id
      });
    }
  });

  // Custom method hooks
  const originalAddTag = Contact.prototype.addTag;
  Contact.prototype.addTag = async function(tag) {
    const result = await originalAddTag.call(this, tag);
    
    flowEngine.triggerEvent('contact.tagged', {
      contact: this.toObject(),
      contactId: this._id,
      tag,
      allTags: this.tags
    });
    
    return result;
  };

  const originalAddInteraction = Contact.prototype.addInteraction;
  Contact.prototype.addInteraction = async function(interactionData) {
    const result = await originalAddInteraction.call(this, interactionData);
    
    flowEngine.triggerEvent('contact.interaction.added', {
      contact: this.toObject(),
      contactId: this._id,
      interaction: interactionData,
      interactionType: interactionData.type
    });
    
    return result;
  };

  const originalUpdateBuyerStatus = Contact.prototype.updateBuyerStatus;
  Contact.prototype.updateBuyerStatus = async function(status) {
    const oldStatus = this.buyerProfile?.status;
    const result = await originalUpdateBuyerStatus.call(this, status);
    
    flowEngine.triggerEvent('contact.status.changed', {
      contact: this.toObject(),
      contactId: this._id,
      oldStatus,
      newStatus: status
    });
    
    return result;
  };

  const originalSetNextFollowUp = Contact.prototype.setNextFollowUp;
  Contact.prototype.setNextFollowUp = async function(date, notes) {
    const result = await originalSetNextFollowUp.call(this, date, notes);
    
    flowEngine.triggerEvent('contact.followup.scheduled', {
      contact: this.toObject(),
      contactId: this._id,
      followUpDate: date,
      notes
    });
    
    return result;
  };

  logger.info('  ✓ Contact events configured');
}

/**
 * Setup Property model events
 */
function setupPropertyEvents() {
  // Property created
  Property.schema.post('save', function(doc, next) {
    if (this.isNew) {
      flowEngine.triggerEvent('property.created', {
        property: doc.toObject(),
        propertyId: doc._id,
        type: doc.type,
        area: doc.address?.area,
        rent: doc.rent?.amount
      });
      
      // Check if listed
      if (doc.listing?.isListed) {
        flowEngine.triggerEvent('property.listed', {
          property: doc.toObject(),
          propertyId: doc._id,
          listPrice: doc.listing.listPrice
        });
      }
    }
    next();
  });

  // Property updated
  Property.schema.post('findOneAndUpdate', async function(doc) {
    if (doc) {
      flowEngine.triggerEvent('property.updated', {
        property: doc.toObject(),
        propertyId: doc._id
      });
    }
  });

  // Custom method hooks
  const originalUpdateListingPrice = Property.prototype.updateListingPrice;
  Property.prototype.updateListingPrice = async function(newPrice, reason) {
    const oldPrice = this.listing?.listPrice;
    const result = await originalUpdateListingPrice.call(this, newPrice, reason);
    
    flowEngine.triggerEvent('property.price.changed', {
      property: this.toObject(),
      propertyId: this._id,
      oldPrice,
      newPrice,
      reason
    });
    
    return result;
  };

  const originalMarkAsOccupied = Property.prototype.markAsOccupied;
  Property.prototype.markAsOccupied = async function(tenantId, leaseStart, leaseEnd, rentDueDate) {
    const oldStatus = this.status;
    const result = await originalMarkAsOccupied.call(this, tenantId, leaseStart, leaseEnd, rentDueDate);
    
    flowEngine.triggerEvent('property.status.changed', {
      property: this.toObject(),
      propertyId: this._id,
      oldStatus,
      newStatus: 'occupied',
      tenantId
    });
    
    return result;
  };

  const originalMarkAsAvailable = Property.prototype.markAsAvailable;
  Property.prototype.markAsAvailable = async function() {
    const oldStatus = this.status;
    const result = await originalMarkAsAvailable.call(this);
    
    flowEngine.triggerEvent('property.status.changed', {
      property: this.toObject(),
      propertyId: this._id,
      oldStatus,
      newStatus: 'available'
    });
    
    return result;
  };

  logger.info('  ✓ Property events configured');
}

/**
 * Setup Transaction model events
 */
function setupTransactionEvents() {
  // Transaction created
  Transaction.schema.post('save', function(doc, next) {
    if (this.isNew) {
      flowEngine.triggerEvent('transaction.created', {
        transaction: doc.toObject(),
        transactionId: doc._id,
        dealType: doc.dealType,
        stage: doc.pipeline?.stage,
        propertyId: doc.property
      });
    }
    next();
  });

  // Transaction updated
  Transaction.schema.post('findOneAndUpdate', async function(doc) {
    if (doc) {
      flowEngine.triggerEvent('transaction.updated', {
        transaction: doc.toObject(),
        transactionId: doc._id
      });
    }
  });

  // Custom method hooks
  const originalMoveToStage = Transaction.prototype.moveToStage;
  Transaction.prototype.moveToStage = async function(newStage, notes) {
    const oldStage = this.pipeline?.stage;
    const result = await originalMoveToStage.call(this, newStage, notes);
    
    flowEngine.triggerEvent('transaction.stage.changed', {
      transaction: this.toObject(),
      transactionId: this._id,
      oldStage,
      newStage,
      probability: this.pipeline.probability,
      notes
    });
    
    return result;
  };

  const originalAddMilestone = Transaction.prototype.addMilestone;
  Transaction.prototype.addMilestone = async function(name, dueDate, assignedTo) {
    const result = await originalAddMilestone.call(this, name, dueDate, assignedTo);
    
    flowEngine.triggerEvent('transaction.milestone.added', {
      transaction: this.toObject(),
      transactionId: this._id,
      milestoneName: name,
      dueDate,
      assignedTo
    });
    
    return result;
  };

  const originalCompleteMilestone = Transaction.prototype.completeMilestone;
  Transaction.prototype.completeMilestone = async function(milestoneName) {
    const result = await originalCompleteMilestone.call(this, milestoneName);
    
    flowEngine.triggerEvent('transaction.milestone.completed', {
      transaction: this.toObject(),
      transactionId: this._id,
      milestoneName
    });
    
    return result;
  };

  const originalAddTask = Transaction.prototype.addTask;
  Transaction.prototype.addTask = async function(taskData) {
    const result = await originalAddTask.call(this, taskData);
    
    flowEngine.triggerEvent('transaction.task.added', {
      transaction: this.toObject(),
      transactionId: this._id,
      task: taskData
    });
    
    return result;
  };

  const originalCompleteTask = Transaction.prototype.completeTask;
  Transaction.prototype.completeTask = async function(taskId) {
    const result = await originalCompleteTask.call(this, taskId);
    
    flowEngine.triggerEvent('transaction.task.completed', {
      transaction: this.toObject(),
      transactionId: this._id,
      taskId
    });
    
    return result;
  };

  const originalAddDocument = Transaction.prototype.addDocument;
  Transaction.prototype.addDocument = async function(documentData) {
    const result = await originalAddDocument.call(this, documentData);
    
    flowEngine.triggerEvent('transaction.document.added', {
      transaction: this.toObject(),
      transactionId: this._id,
      document: documentData
    });
    
    return result;
  };

  logger.info('  ✓ Transaction events configured');
}

/**
 * Schedule periodic checks for overdue items
 */
function setupPeriodicChecks() {
  // Check for overdue follow-ups every hour
  setInterval(async () => {
    try {
      const overdueContacts = await Contact.findOverdueFollowUps();
      
      overdueContacts.forEach(contact => {
        flowEngine.triggerEvent('contact.followup.overdue', {
          contact: contact.toObject(),
          contactId: contact._id,
          followUpDate: contact.nextFollowUpDate,
          assignedTo: contact.assignedTo
        });
      });
    } catch (error) {
      logger.error(`Error checking overdue follow-ups: ${error.message}`);
    }
  }, 60 * 60 * 1000); // Every hour

  // Check for overdue milestones every 6 hours
  setInterval(async () => {
    try {
      const overdueTransactions = await Transaction.getOverdueTransactions();
      
      overdueTransactions.forEach(transaction => {
        const overdueMilestones = transaction.getOverdueMilestones();
        const overdueTasks = transaction.getOverdueTasks();
        
        if (overdueMilestones.length > 0) {
          flowEngine.triggerEvent('transaction.milestone.overdue', {
            transaction: transaction.toObject(),
            transactionId: transaction._id,
            overdueMilestones
          });
        }
        
        if (overdueTasks.length > 0) {
          flowEngine.triggerEvent('transaction.task.overdue', {
            transaction: transaction.toObject(),
            transactionId: transaction._id,
            overdueTasks
          });
        }
      });
    } catch (error) {
      logger.error(`Error checking overdue transactions: ${error.message}`);
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  logger.info('  ✓ Periodic checks scheduled');
}

module.exports = {
  setupModelEvents,
  setupPeriodicChecks
};
