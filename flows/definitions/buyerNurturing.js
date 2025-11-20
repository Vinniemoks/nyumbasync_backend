/**
 * Buyer Nurturing Flow Definitions
 * Automated workflows for nurturing buyer leads
 */

module.exports = [
  {
    id: 'first-time-buyer-welcome',
    name: 'First-Time Buyer Welcome Sequence',
    description: 'Automatically nurture first-time buyers with helpful content',
    trigger: {
      event: 'contact.tagged'
    },
    conditions: [
      {
        field: 'tag',
        operator: 'equals',
        value: 'first-time-buyer'
      }
    ],
    actions: [
      {
        type: 'sendEmail',
        params: {
          to: '{{contact.email}}',
          subject: 'Welcome! Your Home Buying Journey Starts Here',
          template: 'first-time-buyer-welcome',
          templateData: {
            firstName: '{{contact.firstName}}',
            agentName: 'Your Agent'
          }
        }
      },
      {
        type: 'createSavedSearch',
        params: {
          contactId: '{{contactId}}',
          searchName: 'My First Home Search',
          filters: '{{contact.buyerProfile.criteria}}',
          alertFrequency: 'daily'
        }
      },
      {
        type: 'scheduleFollowUp',
        params: {
          contactId: '{{contactId}}',
          date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Check in on home search progress'
        }
      },
      {
        type: 'addContactInteraction',
        params: {
          contactId: '{{contactId}}',
          type: 'email',
          subject: 'Welcome email sent',
          notes: 'Sent first-time buyer welcome sequence',
          nextAction: 'Follow up in 3 days'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'hot-lead-alert',
    name: 'Hot Lead Alert to Agent',
    description: 'Alert agent when a lead becomes hot',
    trigger: {
      event: 'contact.status.changed'
    },
    conditions: [
      {
        field: 'newStatus',
        operator: 'equals',
        value: 'hot'
      }
    ],
    actions: [
      {
        type: 'sendAgentAlert',
        params: {
          agentId: '{{contact.assignedTo}}',
          alertType: 'hot_lead',
          message: '{{contact.fullName}} is now a HOT lead! Follow up immediately.',
          priority: 'high'
        }
      },
      {
        type: 'sendPushNotification',
        params: {
          userId: '{{contact.assignedTo}}',
          title: '🔥 Hot Lead Alert',
          message: '{{contact.fullName}} is ready to buy!',
          data: {
            contactId: '{{contactId}}',
            type: 'hot_lead'
          }
        }
      },
      {
        type: 'createTask',
        params: {
          title: 'Follow up with hot lead: {{contact.fullName}}',
          description: 'Contact became hot lead. Follow up within 24 hours.',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          priority: 'urgent',
          assignedTo: '{{contact.assignedTo}}'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'buyer-criteria-set',
    name: 'Buyer Criteria Set - Start Property Matching',
    description: 'When buyer sets criteria, start sending matching properties',
    trigger: {
      event: 'contact.updated'
    },
    conditions: [
      {
        field: 'contact.buyerProfile.criteria',
        operator: 'exists'
      },
      {
        field: 'contact.primaryRole',
        operator: 'in',
        value: ['buyer', 'lead']
      }
    ],
    actions: [
      {
        type: 'createSavedSearch',
        params: {
          contactId: '{{contactId}}',
          searchName: 'My Property Search',
          filters: '{{contact.buyerProfile.criteria}}',
          alertFrequency: 'instant'
        }
      },
      {
        type: 'sendEmail',
        params: {
          to: '{{contact.email}}',
          subject: 'Your Property Search is Active',
          template: 'search-activated',
          templateData: {
            firstName: '{{contact.firstName}}',
            criteria: '{{contact.buyerProfile.criteria}}'
          }
        }
      },
      {
        type: 'addContactTag',
        params: {
          contactId: '{{contactId}}',
          tag: 'active-search'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'overdue-followup-reminder',
    name: 'Overdue Follow-up Reminder',
    description: 'Remind agent about overdue follow-ups',
    trigger: {
      event: 'contact.followup.overdue'
    },
    conditions: [],
    actions: [
      {
        type: 'sendAgentAlert',
        params: {
          agentId: '{{contact.assignedTo}}',
          alertType: 'overdue_followup',
          message: 'Follow-up overdue for {{contact.fullName}}',
          priority: 'high'
        }
      },
      {
        type: 'sendEmail',
        params: {
          to: '{{contact.assignedTo.email}}',
          subject: 'Overdue Follow-up: {{contact.fullName}}',
          template: 'overdue-followup-reminder',
          templateData: {
            contactName: '{{contact.fullName}}',
            followUpDate: '{{followUpDate}}'
          }
        }
      },
      {
        type: 'createTask',
        params: {
          title: 'OVERDUE: Follow up with {{contact.fullName}}',
          description: 'This follow-up is overdue. Contact immediately.',
          dueDate: new Date().toISOString(),
          priority: 'urgent',
          assignedTo: '{{contact.assignedTo}}'
        }
      }
    ],
    enabled: true
  }
];
