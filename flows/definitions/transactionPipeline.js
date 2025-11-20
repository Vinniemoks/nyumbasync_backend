/**
 * Transaction Pipeline Flow Definitions
 * Automated workflows for deal pipeline management
 */

module.exports = [
  {
    id: 'showing-scheduled-tasks',
    name: 'Showing Scheduled - Create Tasks',
    description: 'Auto-create tasks when showing is scheduled',
    trigger: {
      event: 'transaction.stage.changed'
    },
    conditions: [
      {
        field: 'newStage',
        operator: 'equals',
        value: 'showing_scheduled'
      }
    ],
    actions: [
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Prepare property for showing',
          description: 'Ensure property is clean and ready for viewing',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          priority: 'high'
        }
      },
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Send showing confirmation to buyer',
          description: 'Confirm showing details with buyer',
          dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          priority: 'high'
        }
      },
      {
        type: 'sendEmail',
        params: {
          to: '{{transaction.primaryBuyer.contact.email}}',
          subject: 'Your Property Showing is Scheduled',
          template: 'showing-confirmation',
          templateData: {
            buyerName: '{{transaction.primaryBuyer.contact.firstName}}',
            propertyTitle: '{{transaction.property.title}}',
            propertyAddress: '{{transaction.property.address}}'
          }
        }
      }
    ],
    enabled: true
  },

  {
    id: 'under-contract-automation',
    name: 'Under Contract - Milestone & Task Creation',
    description: 'Auto-create milestones and tasks when deal goes under contract',
    trigger: {
      event: 'transaction.stage.changed'
    },
    conditions: [
      {
        field: 'newStage',
        operator: 'equals',
        value: 'under_contract'
      }
    ],
    actions: [
      {
        type: 'createMilestone',
        params: {
          transactionId: '{{transactionId}}',
          name: 'Property Inspection',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        type: 'createMilestone',
        params: {
          transactionId: '{{transactionId}}',
          name: 'Appraisal',
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        type: 'createMilestone',
        params: {
          transactionId: '{{transactionId}}',
          name: 'Financing Approval',
          dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Schedule property inspection',
          description: 'Contact inspector and coordinate with buyer',
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 'urgent'
        }
      },
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Order appraisal',
          description: 'Contact appraiser and schedule property appraisal',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 'high'
        }
      },
      {
        type: 'sendEmail',
        params: {
          to: '{{transaction.primaryBuyer.contact.email}}',
          subject: 'Congratulations! Your Offer Was Accepted',
          template: 'under-contract-buyer',
          templateData: {
            buyerName: '{{transaction.primaryBuyer.contact.firstName}}',
            propertyTitle: '{{transaction.property.title}}',
            nextSteps: 'inspection, appraisal, financing'
          }
        }
      }
    ],
    enabled: true
  },

  {
    id: 'inspection-stage-automation',
    name: 'Inspection Stage - Create Tasks',
    description: 'Auto-create tasks when deal moves to inspection stage',
    trigger: {
      event: 'transaction.stage.changed'
    },
    conditions: [
      {
        field: 'newStage',
        operator: 'equals',
        value: 'inspection'
      }
    ],
    actions: [
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Review inspection report',
          description: 'Review report with buyer and discuss any issues',
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 'urgent'
        }
      },
      {
        type: 'createTask',
        params: {
          transactionId: '{{transactionId}}',
          title: 'Negotiate repairs if needed',
          description: 'Discuss repair requests with seller',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 'high'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'milestone-overdue-alert',
    name: 'Milestone Overdue Alert',
    description: 'Alert agent when milestone is overdue',
    trigger: {
      event: 'transaction.milestone.overdue'
    },
    conditions: [],
    actions: [
      {
        type: 'sendAgentAlert',
        params: {
          agentId: '{{transaction.assignedTo}}',
          alertType: 'overdue_milestone',
          message: 'Milestone overdue: {{overdueMilestones[0].name}}',
          priority: 'urgent'
        }
      },
      {
        type: 'sendEmail',
        params: {
          to: '{{transaction.assignedTo.email}}',
          subject: '🚨 Overdue Milestone Alert',
          template: 'overdue-milestone',
          templateData: {
            transactionId: '{{transactionId}}',
            propertyTitle: '{{transaction.property.title}}',
            overdueMilestones: '{{overdueMilestones}}'
          }
        }
      }
    ],
    enabled: true
  },

  {
    id: 'deal-closed-celebration',
    name: 'Deal Closed - Celebration & Follow-up',
    description: 'Send congratulations and schedule follow-up when deal closes',
    trigger: {
      event: 'transaction.stage.changed'
    },
    conditions: [
      {
        field: 'newStage',
        operator: 'equals',
        value: 'closed'
      }
    ],
    actions: [
      {
        type: 'sendEmail',
        params: {
          to: '{{transaction.primaryBuyer.contact.email}}',
          subject: '🎉 Congratulations on Your New Home!',
          template: 'deal-closed-buyer',
          templateData: {
            buyerName: '{{transaction.primaryBuyer.contact.firstName}}',
            propertyTitle: '{{transaction.property.title}}'
          }
        }
      },
      {
        type: 'updateContactStatus',
        params: {
          contactId: '{{transaction.primaryBuyer.contact._id}}',
          status: 'closed'
        }
      },
      {
        type: 'scheduleFollowUp',
        params: {
          contactId: '{{transaction.primaryBuyer.contact._id}}',
          date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Check in on new home - ask for referrals'
        }
      },
      {
        type: 'sendAgentAlert',
        params: {
          agentId: '{{transaction.assignedTo}}',
          alertType: 'deal_closed',
          message: '🎉 Deal closed! {{transaction.property.title}}',
          priority: 'low'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'task-overdue-reminder',
    name: 'Task Overdue Reminder',
    description: 'Remind assigned user about overdue tasks',
    trigger: {
      event: 'transaction.task.overdue'
    },
    conditions: [],
    actions: [
      {
        type: 'sendAgentAlert',
        params: {
          agentId: '{{overdueTasks[0].assignedTo}}',
          alertType: 'overdue_task',
          message: 'Task overdue: {{overdueTasks[0].title}}',
          priority: 'high'
        }
      },
      {
        type: 'sendPushNotification',
        params: {
          userId: '{{overdueTasks[0].assignedTo}}',
          title: 'Overdue Task',
          message: '{{overdueTasks[0].title}} is overdue',
          data: {
            transactionId: '{{transactionId}}',
            taskId: '{{overdueTasks[0]._id}}'
          }
        }
      }
    ],
    enabled: true
  }
];
