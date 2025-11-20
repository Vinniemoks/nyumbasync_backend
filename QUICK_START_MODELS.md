# Quick Start: Core Data Models

## Import Models

```javascript
const { Property, Contact, Transaction } = require('./models');
```

## Common Operations

### Properties

```javascript
// Create a property
const property = await Property.create({
  title: '2BR Apartment in Kilimani',
  type: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  address: {
    street: '456 Oak Ave',
    area: 'Kilimani',
    city: 'Nairobi',
    county: 'Nairobi'
  },
  rent: { amount: 35000 },
  landlord: userId
});

// Find available properties
const available = await Property.findAvailable({
  area: 'Kilimani',
  minRent: 30000,
  maxRent: 50000,
  bedrooms: 2
});

// Link a contact to property
await property.linkContact(contactId, 'interested', 'Viewed on 2024-01-15');

// Calculate investment metrics
property.investment = {
  purchasePrice: 5000000,
  renovationCosts: 500000,
  projectedRentalIncome: 35000
};
await property.calculateInvestmentMetrics();
```

### Contacts

```javascript
// Create a buyer contact
const buyer = await Contact.create({
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: '254722334455',
  primaryRole: 'buyer',
  buyerProfile: {
    status: 'hot',
    preApproved: true,
    preApprovalAmount: 60000,
    criteria: {
      propertyTypes: ['apartment', 'house'],
      minBedrooms: 2,
      maxBedrooms: 3,
      maxPrice: 50000,
      locations: ['Kilimani', 'Westlands'],
      mustHaveAmenities: ['parking', 'security']
    }
  },
  tags: ['first-time-buyer', 'urgent']
});

// Add interaction
await buyer.addInteraction({
  type: 'call',
  subject: 'Initial consultation',
  notes: 'Discussed budget and preferences. Very motivated.',
  nextAction: 'Send property listings',
  nextActionDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
});

// Link to property
await buyer.linkProperty(propertyId, 'viewed', 'Loved the kitchen');

// Find hot leads
const hotLeads = await Contact.findHotLeads();

// Find overdue follow-ups
const overdue = await Contact.findOverdueFollowUps(agentUserId);

// Search contacts
const results = await Contact.searchContacts('jane');
```

### Transactions

```javascript
// Create a deal
const deal = await Transaction.create({
  dealType: 'lease',
  property: propertyId,
  amount: 35000,
  type: 'rent',
  pipeline: {
    stage: 'lead',
    expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }
});

// Add contacts to deal
await deal.addContact(buyerId, 'buyer', true);
await deal.addContact(sellerId, 'seller', true);
await deal.addContact(agentId, 'agent', false);

// Move through pipeline
await deal.moveToStage('showing_scheduled', 'Showing set for tomorrow at 2pm');
await deal.moveToStage('offer_made', 'Buyer offered asking price');
await deal.moveToStage('under_contract', 'Lease agreement signed');

// Add milestones
await deal.addMilestone('Inspection', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), agentUserId);
await deal.addMilestone('Move-in date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

// Complete milestone
await deal.completeMilestone('Inspection');

// Add tasks
await deal.addTask({
  title: 'Schedule inspection',
  description: 'Contact inspector and coordinate with buyer',
  dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  priority: 'high',
  assignedTo: agentUserId
});

// Add document
await deal.addDocument({
  name: 'Lease Agreement',
  type: 'contract',
  url: 'https://storage.example.com/lease-123.pdf',
  uploadedBy: agentUserId
});

// Add note
await deal.addNote('Buyer requested early move-in', agentUserId);

// Get active pipeline
const activePipeline = await Transaction.getActivePipeline();

// Get deals by stage
const underContract = await Transaction.findByStage('under_contract');

// Get overdue deals
const overdueDeals = await Transaction.getOverdueTransactions();

// Get pipeline stats
const stats = await Transaction.getPipelineStats();
```

## The "Sync" Magic

### View Everything About a Property

```javascript
const property = await Property.findById(propertyId)
  .populate('relatedContacts.contact')
  .populate('transactionHistory');

console.log('Property:', property.title);
console.log('Interested Contacts:');
property.relatedContacts.forEach(rc => {
  console.log(`  - ${rc.contact.fullName} (${rc.relationship})`);
});
console.log('Transaction History:');
property.transactionHistory.forEach(txn => {
  console.log(`  - ${txn.dealType} - ${txn.pipeline.stage}`);
});
```

### View Everything About a Contact

```javascript
const contact = await Contact.findById(contactId)
  .populate('relatedProperties.property')
  .populate('relatedTransactions');

console.log('Contact:', contact.fullName);
console.log('Properties:');
contact.relatedProperties.forEach(rp => {
  console.log(`  - ${rp.property.title} (${rp.relationship})`);
});
console.log('Active Deals:');
contact.relatedTransactions.forEach(txn => {
  console.log(`  - ${txn.property.title} - ${txn.pipeline.stage}`);
});
```

### View Complete Deal

```javascript
const deal = await Transaction.findById(dealId)
  .populate('property')
  .populate('contacts.contact')
  .populate('tasks.assignedTo')
  .populate('milestones.assignedTo');

console.log('Deal:', deal.transactionId);
console.log('Property:', deal.property.title);
console.log('Stage:', deal.pipeline.stage);
console.log('Probability:', deal.pipeline.probability + '%');
console.log('Contacts:');
deal.contacts.forEach(c => {
  console.log(`  - ${c.contact.fullName} (${c.role})${c.isPrimary ? ' [PRIMARY]' : ''}`);
});
console.log('Tasks:', deal.tasks.length);
console.log('Completion:', deal.completionPercentage + '%');
```

## Automation Triggers

These are the key events that should trigger Flows:

### Contact Events
- `contact.created` - New contact added
- `contact.tagged` - Tag added (e.g., "first-time-buyer")
- `contact.interaction.added` - New interaction logged
- `contact.followup.due` - Follow-up date reached
- `contact.status.changed` - Buyer status changed (cold → hot)

### Property Events
- `property.created` - New property added
- `property.listed` - Property listed for sale/rent
- `property.price.changed` - Price updated
- `property.status.changed` - Status changed (available → occupied)
- `property.match.found` - Property matches contact criteria

### Transaction Events
- `transaction.created` - New deal started
- `transaction.stage.changed` - Pipeline stage advanced
- `transaction.milestone.due` - Milestone due date approaching
- `transaction.milestone.overdue` - Milestone past due
- `transaction.task.created` - New task added
- `transaction.task.completed` - Task completed
- `transaction.document.added` - Document uploaded

## Next: Build the Flows Engine

With these models in place, you can now implement the Flows Engine to automate:

1. **Lead Nurturing** - Auto-send listings to hot buyers
2. **Follow-up Reminders** - Alert when contacts need follow-up
3. **Pipeline Automation** - Auto-create tasks when stage changes
4. **Smart Matching** - Notify buyers when properties match criteria
5. **Document Reminders** - Alert when documents are due
6. **Milestone Tracking** - Send reminders before deadlines

See the Flows Engine implementation guide for details.
