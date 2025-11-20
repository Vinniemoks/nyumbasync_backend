const mongoose = require('mongoose');
const { Schema } = mongoose;

const workflowSchema = new Schema({
  landlord: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  description: String,
  
  // Workflow Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'draft'
  },
  
  // Trigger Configuration
  trigger: {
    type: {
      type: String,
      required: true,
      enum: ['schedule', 'event', 'status_change', 'date_based', 'manual']
    },
    
    // For schedule triggers
    schedule: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      time: String,
      dayOfWeek: Number,
      dayOfMonth: Number
    },
    
    // For event triggers
    event: {
      type: String,
      enum: [
        'lease_signed', 'payment_received', 'payment_late',
        'maintenance_requested', 'lease_expiring', 'tenant_move_in',
        'tenant_move_out', 'property_listed', 'application_received'
      ]
    },
    
    // For status change triggers
    statusChange: {
      model: String,
      field: String,
      from: String,
      to: String
    },
    
    // For date-based triggers
    dateBased: {
      field: String,
      daysBeforeAfter: Number,
      direction: { type: String, enum: ['before', 'after'] }
    }
  },
  
  // Conditions (optional filters)
  conditions: [{
    field: String,
    operator: { type: String, enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains'] },
    value: Schema.Types.Mixed
  }],
  
  // Actions to perform
  actions: [{
    type: {
      type: String,
      required: true,
      enum: [
        'send_email', 'send_sms', 'create_task', 'update_record',
        'generate_document', 'notify_user', 'call_webhook', 'update_status'
      ]
    },
    
    // For email actions
    email: {
      to: String,
      subject: String,
      template: String,
      body: String
    },
    
    // For SMS actions
    sms: {
      to: String,
      message: String
    },
    
    // For task creation
    task: {
      title: String,
      description: String,
      assignTo: { type: Schema.Types.ObjectId, ref: 'User' },
      dueDate: Date,
      priority: { type: String, enum: ['low', 'medium', 'high'] }
    },
    
    // For record updates
    update: {
      model: String,
      field: String,
      value: Schema.Types.Mixed
    },
    
    // For document generation
    document: {
      template: String,
      outputName: String
    },
    
    // For notifications
    notification: {
      recipient: String,
      message: String,
      type: { type: String, enum: ['info', 'warning', 'success', 'error'] }
    },
    
    // For webhooks
    webhook: {
      url: String,
      method: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE'] },
      headers: Schema.Types.Mixed,
      body: Schema.Types.Mixed
    },
    
    // Delay before action (in minutes)
    delay: { type: Number, default: 0 },
    
    order: { type: Number, default: 0 }
  }],
  
  // Execution History
  executions: [{
    triggeredAt: Date,
    triggeredBy: String,
    status: { type: String, enum: ['success', 'failed', 'partial'] },
    actionsCompleted: Number,
    actionsFailed: Number,
    error: String,
    duration: Number // in milliseconds
  }],
  
  // Statistics
  stats: {
    totalExecutions: { type: Number, default: 0 },
    successfulExecutions: { type: Number, default: 0 },
    failedExecutions: { type: Number, default: 0 },
    lastExecuted: Date,
    averageDuration: Number
  },
  
  // Template flag
  isTemplate: { type: Boolean, default: false },
  templateCategory: String,
  
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
workflowSchema.index({ landlord: 1, status: 1 });
workflowSchema.index({ 'trigger.type': 1 });
workflowSchema.index({ isTemplate: 1 });

// Methods
workflowSchema.methods.execute = async function(context = {}) {
  const execution = {
    triggeredAt: new Date(),
    triggeredBy: context.triggeredBy || 'system',
    status: 'success',
    actionsCompleted: 0,
    actionsFailed: 0
  };
  
  const startTime = Date.now();
  
  try {
    // Sort actions by order
    const sortedActions = this.actions.sort((a, b) => a.order - b.order);
    
    for (const action of sortedActions) {
      try {
        // Apply delay if specified
        if (action.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, action.delay * 60 * 1000));
        }
        
        // Execute action based on type
        await this.executeAction(action, context);
        execution.actionsCompleted++;
      } catch (error) {
        execution.actionsFailed++;
        execution.error = error.message;
        console.error(`Action failed in workflow ${this._id}:`, error);
      }
    }
    
    if (execution.actionsFailed > 0) {
      execution.status = 'partial';
    }
  } catch (error) {
    execution.status = 'failed';
    execution.error = error.message;
  }
  
  execution.duration = Date.now() - startTime;
  
  // Update statistics
  this.stats.totalExecutions++;
  if (execution.status === 'success') {
    this.stats.successfulExecutions++;
  } else {
    this.stats.failedExecutions++;
  }
  this.stats.lastExecuted = new Date();
  this.stats.averageDuration = this.stats.averageDuration 
    ? (this.stats.averageDuration + execution.duration) / 2 
    : execution.duration;
  
  this.executions.push(execution);
  await this.save();
  
  return execution;
};

workflowSchema.methods.executeAction = async function(action, context) {
  const emailService = require('../services/email.service');
  const smsService = require('../services/sms.service');
  const notificationService = require('../services/notification.service');
  
  switch (action.type) {
    case 'send_email':
      await emailService.sendEmail({
        to: this.replaceVariables(action.email.to, context),
        subject: this.replaceVariables(action.email.subject, context),
        text: this.replaceVariables(action.email.body, context)
      });
      break;
      
    case 'send_sms':
      await smsService.sendSMS({
        to: this.replaceVariables(action.sms.to, context),
        message: this.replaceVariables(action.sms.message, context)
      });
      break;
      
    case 'notify_user':
      await notificationService.createNotification({
        user: action.notification.recipient,
        message: this.replaceVariables(action.notification.message, context),
        type: action.notification.type
      });
      break;
      
    case 'update_record':
      const Model = mongoose.model(action.update.model);
      await Model.updateOne(
        { _id: context.recordId },
        { [action.update.field]: action.update.value }
      );
      break;
      
    // Add more action types as needed
  }
};

workflowSchema.methods.replaceVariables = function(text, context) {
  if (!text) return text;
  
  let result = text;
  for (const [key, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
};

module.exports = mongoose.model('Workflow', workflowSchema);
