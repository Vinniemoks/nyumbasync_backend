# Nyumbasync Core Data Models

## The Three Pillars Architecture

Nyumbasync is built on three deeply interconnected core entities that form the foundation of your real estate operating system:

### 1. **Properties (Nyumba)** - The Central Node
Every property is a rich data object that serves as the hub for all related information.

**Key Features:**
- Complete property specifications (beds, baths, sq ft, lot size, year built)
- Dynamic listing data (price, status, days on market)
- Investment analysis (purchase price, renovation costs, rental income, cap rate, ROI)
- Historical tracking (price changes, status updates, maintenance)
- Media gallery (photos, floor plans, virtual tours)
- Related contacts and transaction history

**Model Location:** `models/property.model.js`

**Key Methods:**
- `linkContact(contactId, relationship)` - Connect a contact to this property
- `addToHistory(event, description)` - Track property events
- `calculateInvestmentMetrics()` - Auto-calculate cap rate, cash flow, ROI
- `updateListingPrice(newPrice, reason)` - Update price with history tracking

**Relationships:**
- `relatedContacts[]` - All people who have interacted with this property
- `transactionHistory[]` - All deals involving this property
- `landlord` - Property owner (User reference)
- `currentTenant` - Active tenant information

---

### 2. **Contacts (People)** - The Relationship Hub
Every person in your business is a Contact with roles, preferences, and interaction history.

**Key Features:**
- Multi-role support (buyer, seller, lead, lender, inspector, contractor, agent)
- Buyer profile with search criteria and saved searches
- Seller profile with property details and motivation
- Complete interaction history (calls, emails, texts, meetings, showings)
- Tag-based organization for automation triggers
- Communication preferences and opt-in tracking

**Model Location:** `models/contact.model.js`

**Key Methods:**
- `addInteraction(data)` - Log any interaction (call, email, meeting, etc.)
- `addTag(tag)` - Add tags for organization and automation
- `linkProperty(propertyId, relationship)` - Connect to a property
- `updateBuyerStatus(status)` - Update lead temperature (cold/warm/hot/active)
- `setNextFollowUp(date, notes)` - Schedule follow-up with automation trigger

**Relationships:**
- `relatedProperties[]` - Properties they've viewed, offered on, or own
- `relatedTransactions[]` - All deals they're involved in
- `assignedTo` - The agent/user managing this contact
- `referredBy` - Referral source tracking

**Static Methods:**
- `findHotLeads()` - Get all hot/active buyer leads
- `findOverdueFollowUps(userId)` - Get contacts needing follow-up
- `findByTag(tag)` - Find contacts by tag (for automation)

---

### 3. **Transactions (Deals)** - The Process Engine
Each transaction is a complete deal timeline with pipeline stages, milestones, and documents.

**Key Features:**
- Pipeline stages (lead → qualified → showing → offer → contract → closing → closed)
- Automated probability tracking based on stage
- Milestones with due dates and automation triggers
- Task management with assignments
- Document vault for all deal paperwork
- Financial summary tracking
- Multi-contact support (buyer, seller, agents, lenders, etc.)

**Model Location:** `models/transaction.model.js`

**Key Methods:**
- `moveToStage(stage, notes)` - Advance deal through pipeline
- `addMilestone(name, dueDate)` - Create key deadline
- `completeMilestone(name)` - Mark milestone complete
- `addTask(taskData)` - Create task with assignment
- `addDocument(documentData)` - Upload deal document
- `addContact(contactId, role)` - Link contact to deal
- `addNote(content, userId)` - Add deal note

**Relationships:**
- `property` - The property being transacted
- `contacts[]` - All people involved (buyers, sellers, agents, etc.)
- `documents[]` - All deal paperwork
- `milestones[]` - Key dates and deadlines
- `tasks[]` - Action items with assignments

**Static Methods:**
- `findByStage(stage)` - Get all deals in a specific stage
- `getActivePipeline()` - Get all active deals sorted by probability
- `getOverdueTransactions()` - Find deals with overdue tasks/milestones
- `getPipelineStats()` - Get deal pipeline analytics

---

## The "Sync" Magic: How They Connect

The power of Nyumbasync comes from the deep relationships between these three entities:

### Property → Contacts
```javascript
// See everyone who's interacted with a property
property.relatedContacts.forEach(rc => {
  console.log(`${rc.contact.fullName} - ${rc.relationship}`);
});
```

### Property → Transactions
```javascript
// See all deals for a property
property.transactionHistory.forEach(txn => {
  console.log(`${txn.dealType} - ${txn.pipeline.stage}`);
});
```

### Contact → Properties
```javascript
// See all properties a contact has viewed or offered on
contact.relatedProperties.forEach(rp => {
  console.log(`${rp.property.title} - ${rp.relationship}`);
});
```

### Contact → Transactions
```javascript
// See all deals a contact is involved in
contact.relatedTransactions.forEach(txn => {
  console.log(`${txn.property.title} - ${txn.pipeline.stage}`);
});
```

### Transaction → Everything
```javascript
// A transaction connects property and all contacts
const deal = await Transaction.findById(id)
  .populate('property')
  .populate('contacts.contact');

console.log(`Property: ${deal.property.title}`);
console.log(`Buyer: ${deal.primaryBuyer.contact.fullName}`);
console.log(`Seller: ${deal.primarySeller.contact.fullName}`);
```

---

## Usage Examples

### Creating a Complete Deal Flow

```javascript
// 1. Create or find a property
const property = await Property.create({
  title: '3BR House in Westlands',
  type: 'house',
  bedrooms: 3,
  bathrooms: 2,
  address: { street: '123 Main St', area: 'Westlands', city: 'Nairobi' },
  rent: { amount: 50000 },
  landlord: landlordUserId
});

// 2. Create buyer contact
const buyer = await Contact.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '254712345678',
  primaryRole: 'buyer',
  buyerProfile: {
    status: 'hot',
    criteria: {
      minBedrooms: 2,
      maxPrice: 60000,
      locations: ['Westlands', 'Kilimani']
    }
  }
});

// 3. Link buyer to property
await buyer.linkProperty(property._id, 'interested');
await property.linkContact(buyer._id, 'interested');

// 4. Create transaction
const transaction = await Transaction.create({
  dealType: 'lease',
  property: property._id,
  amount: 50000,
  pipeline: {
    stage: 'showing_scheduled',
    expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }
});

// 5. Add buyer to transaction
await transaction.addContact(buyer._id, 'buyer', true);

// 6. Add showing interaction to buyer
await buyer.addInteraction({
  type: 'showing',
  notes: 'Showed property, very interested in the kitchen',
  nextAction: 'Follow up on financing',
  nextActionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
});

// 7. Move deal forward
await transaction.moveToStage('offer_made', 'Buyer submitted offer at asking price');

// 8. Add milestone
await transaction.addMilestone('Lease signing', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
```

### Finding Hot Leads for a Property

```javascript
// Get all hot buyer leads
const hotBuyers = await Contact.findHotLeads();

// Find matches for a specific property
const property = await Property.findById(propertyId);

const matches = hotBuyers.filter(buyer => {
  const criteria = buyer.buyerProfile.criteria;
  return (
    (!criteria.minBedrooms || property.bedrooms >= criteria.minBedrooms) &&
    (!criteria.maxPrice || property.rent.amount <= criteria.maxPrice) &&
    (!criteria.locations.length || criteria.locations.includes(property.address.area))
  );
});

// Auto-notify matches (this would be a Flow automation)
matches.forEach(async buyer => {
  await buyer.addInteraction({
    type: 'email',
    notes: `Auto-sent new listing: ${property.title}`,
    nextAction: 'Wait for response'
  });
});
```

### Pipeline Dashboard

```javascript
// Get all active deals
const activePipeline = await Transaction.getActivePipeline();

// Group by stage
const pipelineByStage = {};
activePipeline.forEach(deal => {
  const stage = deal.pipeline.stage;
  if (!pipelineByStage[stage]) {
    pipelineByStage[stage] = [];
  }
  pipelineByStage[stage].push(deal);
});

// Get overdue items
const overdue = await Transaction.getOverdueTransactions();
```

---

## Next Steps: The Flows Engine

With these core models in place, you can now build the **Flows Engine** - the automation layer that makes Nyumbasync proactive:

- **Event-driven triggers**: When a Contact is tagged "First-Time Buyer"...
- **Automated actions**: Create saved search, send email sequence, schedule follow-up
- **Smart matching**: When a Property matches a Contact's criteria, auto-notify
- **Pipeline automation**: When Transaction moves to "Inspection", auto-create tasks

See `FLOWS_ENGINE.md` (coming next) for implementation details.

---

## Database Indexes

All models include optimized indexes for common queries:

**Property:**
- Geospatial index on coordinates
- Compound indexes on area + status, type + status, rent + status
- Text search on title and description

**Contact:**
- Indexes on email, phone, primaryRole, tags
- Compound index on assignedTo + status
- Index on nextFollowUpDate for automation
- Text search on name and email

**Transaction:**
- Indexes on property, contacts, pipeline.stage
- Indexes on milestone and task due dates
- Compound indexes for common queries

---

## Model Files

- `models/property.model.js` - Property model with investment analysis
- `models/contact.model.js` - Contact model with CRM features
- `models/transaction.model.js` - Transaction model with pipeline
- `models/user.model.js` - User/authentication model
- `models/index.js` - Central export for all models
