# Nyumbasync Flows Engine Guide

## Overview

The Flows Engine is the automation layer that makes Nyumbasync proactive. It's an event-driven system that automatically executes workflows based on triggers from your core data models.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FLOWS ENGINE                           │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Events     │───►│  Conditions  │───►│   Actions    │ │
│  │  (Triggers)  │    │   (Filters)  │    │  (Execute)   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ▲                                          │
         │                                          │
         │                                          ▼
┌────────┴────────┐                      ┌──────────────────┐
│  Data Models    │                      │  External        │
│  - Property     │                      │  Services        │
│  - Contact      │                      │  - Email         │
│  - Transaction  │                      │  - SMS           │
└─────────────────┘                      │  - Notifications │
                                         └──────────────────┘
```

## Core Concepts

### 1. Events (Triggers)
Events are emitted by your data models when something happens:

**Contact Events:**
- `contact.created` - New contact added
- `contact.tagged` - Tag added to contact
- `contact.interaction.added` - New interaction logged
- `contact.status.changed` - Buyer status changed
- `contact.followup.scheduled` - Follow-up scheduled
- `contact.followup.overdue` - Follow-up is overdue

**Property Events:**
- `property.created` - New property added
- `property.listed` - Property listed for sale/rent
- `property.price.changed` - Price updated
- `property.status.changed` - Status changed

**Transaction Events:**
- `transaction.created` - New deal started
- `transaction.stage.changed` - Pipeline stage changed
- `transaction.milestone.added` - Milestone created
- `transaction.milestone.completed` - Milestone completed
- `transaction.milestone.overdue` - Milestone overdue
- `transaction.task.added` - Task created
- `transaction.task.completed` - Task completed
- `transaction.task.overdue` - Task overdue
- `transaction.document.added` - Document uploaded

### 2. Conditions (Filters)
Conditions determine if a flow should execute:

**Operators:**
- `equals` - Field equals value
- `not_equals` - Field does not equal value
- `contains` - Array contains value
- `not_contains` - Array does not contain value
- `greater_than` - Field > value
- `less_than` - Field < value
- `exists` - Field exists
- `not_exists` - Field does not exist
- `in` - Field is in array
- `not_in` - Field is not in array

### 3. Actions
Actions are what the flow executes:

**Data Actions:**
- `addContactTag` - Add tag to contact
- `updateContactStatus` - Update contact status
- `linkContactToProperty` - Link contact to property
- `addContactInteraction` - Log interaction
- `moveTransactionStage` - Move deal to new stage
- `createSavedSearch` - Create saved search for buyer

**Task Actions:**
- `createTask` - Create a task
- `createMilestone` - Create a milestone
- `scheduleFollowUp` - Schedule follow-up

**Communication Actions:**
- `sendEmail` - Send email
- `sendEmailSequence` - Start email sequence
- `sendTemplateEmail` - Send template email
- `sendSMS` - Send SMS
- `sendSMSNotification` - Send SMS notification

**Notification Actions:**
- `sendPushNotification` - Send push notification
- `sendInAppNotification` - Create in-app notification
- `sendAgentAlert` - Alert agent

## Flow Definition Structure

```javascript
{
  id: 'unique-flow-id',
  name: 'Human Readable Name',
  description: 'What this flow does',
  trigger: {
    event: 'event.name'
  },
  conditions: [
    {
      field: 'path.to.field',
      operator: 'equals',
      value: 'expected-value'
    }
  ],
  actions: [
    {
      type: 'actionType',
      params: {
        param1: 'value',
        param2: '{{dynamic.value}}'
      }
    }
  ],
  enabled: true
}
```

## Dynamic Parameters

Use `{{field.path}}` to reference event data:

```javascript
{
  type: 'sendEmail',
  params: {
    to: '{{contact.email}}',
    subject: 'Hello {{contact.firstName}}!',
    template: 'welcome',
    templateData: {
      name: '{{contact.fullName}}',
      phone: '{{contact.phone}}'
    }
  }
}
```

## Pre-Built Flows

### Buyer Nurturing Flows

**1. First-Time Buyer Welcome**
- **Trigger:** Contact tagged "first-time-buyer"
- **Actions:**
  - Send welcome email
  - Create saved search
  - Schedule 3-day follow-up
  - Log interaction

**2. Hot Lead Alert**
- **Trigger:** Contact status changed to "hot"
- **Actions:**
  - Alert assigned agent
  - Send push notification
  - Create urgent follow-up task

**3. Overdue Follow-up Reminder**
- **Trigger:** Follow-up date passed
- **Actions:**
  - Alert agent
  - Send email reminder
  - Create urgent task

### Transaction Pipeline Flows

**1. Showing Scheduled**
- **Trigger:** Deal moved to "showing_scheduled"
- **Actions:**
  - Create preparation tasks
  - Send confirmation email to buyer
  - Create showing checklist

**2. Under Contract**
- **Trigger:** Deal moved to "under_contract"
- **Actions:**
  - Create inspection milestone (7 days)
  - Create appraisal milestone (14 days)
  - Create financing milestone (21 days)
  - Create inspection task (3 days)
  - Send congratulations email

**3. Deal Closed**
- **Trigger:** Deal moved to "closed"
- **Actions:**
  - Send congratulations email
  - Update contact status
  - Schedule 30-day follow-up
  - Alert agent

### Property Matching Flows

**1. New Property Match**
- **Trigger:** New property created
- **Actions:**
  - Find matching buyers
  - Send instant alerts
  - Log interactions

**2. Price Drop Alert**
- **Trigger:** Property price decreased
- **Actions:**
  - Notify interested contacts
  - Send email alerts
  - Update saved searches

## Usage Examples

### Initialize the Flow Engine

```javascript
const { initializeFlowEngine } = require('./flows');

// In your app.js or server.js
await initializeFlowEngine();
```

### Register a Custom Flow

```javascript
const { flowEngine } = require('./flows');

flowEngine.registerFlow({
  id: 'my-custom-flow',
  name: 'My Custom Flow',
  trigger: {
    event: 'contact.created'
  },
  conditions: [
    {
      field: 'contact.primaryRole',
      operator: 'equals',
      value: 'buyer'
    }
  ],
  actions: [
    {
      type: 'sendEmail',
      params: {
        to: '{{contact.email}}',
        subject: 'Welcome!',
        template: 'welcome'
      }
    }
  ],
  enabled: true
});
```

### Manually Trigger an Event

```javascript
const { flowEngine } = require('./flows');

await flowEngine.triggerEvent('contact.created', {
  contact: contactData,
  contactId: contact._id
});
```

### Enable/Disable Flows

```javascript
// Disable a flow
flowEngine.disableFlow('first-time-buyer-welcome');

// Enable a flow
flowEngine.enableFlow('first-time-buyer-welcome');
```

### Get Flow Statistics

```javascript
const stats = flowEngine.getStats();
console.log(stats);
// {
//   totalFlows: 15,
//   enabledFlows: 12,
//   disabledFlows: 3,
//   totalExecutions: 1234,
//   registeredActions: 18,
//   historySize: 500,
//   isRunning: true
// }
```

### View Execution History

```javascript
const history = flowEngine.getExecutionHistory(20);
history.forEach(execution => {
  console.log(`${execution.flowName}: ${execution.status}`);
});
```

## API Endpoints

### Get All Flows
```
GET /api/flows
```

### Get Flow Statistics
```
GET /api/flows/stats
```

### Get Specific Flow
```
GET /api/flows/:flowId
```

### Register New Flow
```
POST /api/flows
Body: { flow definition }
```

### Enable Flow
```
PUT /api/flows/:flowId/enable
```

### Disable Flow
```
PUT /api/flows/:flowId/disable
```

### Delete Flow
```
DELETE /api/flows/:flowId
```

### Get Execution History
```
GET /api/flows/history/recent?limit=50
```

### Manually Trigger Event
```
POST /api/flows/trigger
Body: {
  "eventName": "contact.created",
  "eventData": { ... }
}
```

## Creating Custom Actions

```javascript
// In flows/actions/customActions.js
async function myCustomAction(params, eventData) {
  const { param1, param2 } = params;
  
  // Your custom logic here
  console.log('Executing custom action');
  
  return {
    success: true,
    result: 'Action completed'
  };
}

// Register the action
flowEngine.registerAction('myCustomAction', myCustomAction);
```

## Best Practices

### 1. Keep Actions Atomic
Each action should do one thing well. Don't combine multiple operations in a single action.

### 2. Use Conditions Wisely
Add conditions to prevent unnecessary executions. This saves resources and prevents spam.

### 3. Handle Errors Gracefully
Actions should catch and log errors without crashing the flow.

### 4. Test Flows Thoroughly
Use the manual trigger endpoint to test flows before enabling them.

### 5. Monitor Execution History
Regularly check execution history to identify issues or optimization opportunities.

### 6. Use Descriptive Names
Give flows and actions clear, descriptive names for easy management.

### 7. Document Custom Flows
Add descriptions to custom flows explaining what they do and why.

## Troubleshooting

### Flow Not Executing

1. Check if flow is enabled: `flowEngine.getFlow('flow-id')`
2. Verify conditions are met
3. Check execution history for errors
4. Ensure event is being triggered

### Action Failing

1. Check action parameters are correct
2. Verify dynamic parameters resolve correctly
3. Check action handler logs
4. Test action in isolation

### Performance Issues

1. Review execution history for slow actions
2. Add more specific conditions to reduce executions
3. Consider batching similar actions
4. Monitor Flow Engine stats

## Advanced Features

### Conditional Actions

```javascript
actions: [
  {
    type: 'sendEmail',
    params: {
      to: '{{contact.email}}',
      subject: 'Welcome!',
      template: 'welcome'
    },
    condition: {
      field: 'contact.emailOptIn',
      operator: 'equals',
      value: true
    }
  }
]
```

### Action Delays

```javascript
actions: [
  {
    type: 'sendEmail',
    params: { ... },
    delay: 3600000 // 1 hour in milliseconds
  }
]
```

### Action Retries

```javascript
actions: [
  {
    type: 'sendEmail',
    params: { ... },
    retries: 3,
    retryDelay: 60000 // 1 minute
  }
]
```

## Integration with Models

The Flow Engine automatically integrates with your models through event emitters. No additional code needed in your controllers!

```javascript
// This automatically triggers flows
const contact = await Contact.create({...});
contact.addTag('first-time-buyer'); // Triggers contact.tagged event
```

## Next Steps

1. Review pre-built flows in `flows/definitions/`
2. Test flows using the API endpoints
3. Create custom flows for your specific needs
4. Monitor execution history
5. Optimize based on usage patterns

---

**The Flows Engine makes Nyumbasync truly automated. Set it up once, and let it work for you 24/7!** 🚀
