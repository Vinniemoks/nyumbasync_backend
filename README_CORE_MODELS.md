# 🏠 Nyumbasync Core Data Models

> **The foundation of your self-hosted real estate operating system**

## 🎯 What's Been Built

The three-pillar architecture that powers Nyumbasync is now complete:

1. **Property Model** - The central node for all property data
2. **Contact Model** - The relationship hub for all people
3. **Transaction Model** - The process engine for all deals

These models are deeply interconnected, creating the "sync magic" where clicking on any entity instantly shows all related information.

## 📁 Files Created

### Core Models
- `models/property.model.js` - Property model with investment analysis
- `models/contact.model.js` - Contact model with CRM features  
- `models/transaction.model.js` - Transaction model with pipeline management
- `models/index.js` - Central export for all models

### Documentation
- `CORE_DATA_MODELS.md` - Complete documentation with examples
- `QUICK_START_MODELS.md` - Quick reference guide
- `DATA_MODEL_DIAGRAM.md` - Visual diagrams and relationships
- `CORE_MODELS_COMPLETE.md` - Implementation summary
- `README_CORE_MODELS.md` - This file

### Setup Scripts
- `scripts/setup-core-models.js` - Initialize database with indexes
- `scripts/seed-sample-data.js` - Create sample data for testing

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd nyumbasync_backend
npm install
```

### 2. Setup Database
```bash
npm run setup:models
```

This will:
- Connect to MongoDB
- Create all necessary indexes
- Verify the setup

### 3. Add Sample Data (Optional)
```bash
npm run seed:sample
```

This creates:
- 2 sample properties
- 3 sample contacts (buyers, inspector)
- 2 sample transactions with milestones and tasks
- Complete relationships between all entities

### 4. Start Using the Models

```javascript
const { Property, Contact, Transaction } = require('./models');

// Find hot leads
const hotLeads = await Contact.findHotLeads();

// Find available properties
const properties = await Property.findAvailable({ 
  area: 'Kilimani',
  maxRent: 50000 
});

// Get active pipeline
const pipeline = await Transaction.getActivePipeline();
```

## 📚 Documentation Guide

**Start here:**
1. Read `CORE_DATA_MODELS.md` for complete understanding
2. Use `QUICK_START_MODELS.md` as your daily reference
3. Check `DATA_MODEL_DIAGRAM.md` for visual understanding

**For specific tasks:**
- Creating properties → `QUICK_START_MODELS.md` - Properties section
- Managing contacts → `QUICK_START_MODELS.md` - Contacts section
- Building deals → `QUICK_START_MODELS.md` - Transactions section
- Understanding relationships → `DATA_MODEL_DIAGRAM.md`

## 🔑 Key Features

### Property Model
✅ Complete property specifications
✅ Investment analysis (cap rate, ROI, cash flow)
✅ Listing data with price history
✅ Related contacts and transactions
✅ Media gallery and documents
✅ Kenyan-specific fields

### Contact Model
✅ Multi-role support (buyer, seller, lender, etc.)
✅ Buyer profile with search criteria
✅ Complete interaction history
✅ Tag-based organization
✅ Follow-up scheduling
✅ Related properties and deals

### Transaction Model
✅ Pipeline stages (lead → closed)
✅ Automated probability tracking
✅ Milestones and tasks
✅ Document vault
✅ Multi-contact support
✅ Financial summary

## 🔗 The "Sync" Magic

All three models are interconnected:

```javascript
// Property → See all contacts and deals
const property = await Property.findById(id)
  .populate('relatedContacts.contact')
  .populate('transactionHistory');

// Contact → See all properties and deals
const contact = await Contact.findById(id)
  .populate('relatedProperties.property')
  .populate('relatedTransactions');

// Transaction → See property and all people
const deal = await Transaction.findById(id)
  .populate('property')
  .populate('contacts.contact');
```

## 🎨 Example: Complete Deal Flow

```javascript
// 1. Create property
const property = await Property.create({
  title: '2BR Apartment in Kilimani',
  type: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  address: { street: '123 Main', area: 'Kilimani', city: 'Nairobi' },
  rent: { amount: 35000 },
  landlord: userId
});

// 2. Create buyer
const buyer = await Contact.create({
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '254722334455',
  primaryRole: 'buyer',
  buyerProfile: {
    status: 'hot',
    criteria: { maxPrice: 50000, locations: ['Kilimani'] }
  }
});

// 3. Link them
await buyer.linkProperty(property._id, 'interested');
await property.linkContact(buyer._id, 'interested');

// 4. Create deal
const deal = await Transaction.create({
  dealType: 'lease',
  property: property._id,
  amount: 35000,
  pipeline: { stage: 'showing_scheduled' }
});

// 5. Add buyer to deal
await deal.addContact(buyer._id, 'buyer', true);

// 6. Add milestone
await deal.addMilestone('Property viewing', new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

// Done! Everything is connected.
```

## 🧪 Testing

### Run Setup
```bash
npm run setup:models
```

### Add Sample Data
```bash
npm run seed:sample
```

### Test Queries
```javascript
// Hot leads
const leads = await Contact.findHotLeads();
console.log(`Found ${leads.length} hot leads`);

// Available properties
const props = await Property.findAvailable({ area: 'Kilimani' });
console.log(`Found ${props.length} properties in Kilimani`);

// Active pipeline
const pipeline = await Transaction.getActivePipeline();
console.log(`${pipeline.length} active deals`);

// Overdue follow-ups
const overdue = await Contact.findOverdueFollowUps();
console.log(`${overdue.length} contacts need follow-up`);
```

## 🎯 Next Steps

### 1. Build API Endpoints
Create REST API endpoints for:
- Properties CRUD
- Contacts CRUD
- Transactions CRUD
- Search and filtering
- Relationship management

### 2. Implement the Flows Engine
Build the automation layer:
- Event emitters on model changes
- Flow definitions (JSON configs)
- Flow processor (execute actions)
- Action library (email, SMS, tasks)

### 3. Build the Frontend
Create UI for:
- Property listings and details
- Contact management (CRM)
- Deal pipeline (Kanban board)
- Dashboard with analytics

### 4. Add Integrations
Connect to external services:
- MLS data feeds
- Email (SendGrid, Mailgun)
- SMS (Twilio)
- Calendar (Google Calendar)
- Payment (M-Pesa, Stripe)

## 📊 Database Performance

All models include optimized indexes for:
- Fast queries on common fields
- Geospatial searches (properties)
- Full-text search
- Relationship lookups
- Date-based queries

## 🛠️ NPM Scripts

```bash
npm run setup:models  # Initialize database with indexes
npm run seed:sample   # Add sample data for testing
npm run dev          # Start development server
npm test             # Run tests
```

## 📖 Model Reference

### Property
```javascript
Property.findAvailable(filters)
Property.findByLandlord(landlordId)
Property.getAreaStats()
property.linkContact(contactId, relationship)
property.calculateInvestmentMetrics()
```

### Contact
```javascript
Contact.findHotLeads()
Contact.findOverdueFollowUps(userId)
Contact.findByTag(tag)
contact.addInteraction(data)
contact.linkProperty(propertyId, relationship)
```

### Transaction
```javascript
Transaction.getActivePipeline()
Transaction.findByStage(stage)
Transaction.getOverdueTransactions()
transaction.moveToStage(stage)
transaction.addMilestone(name, dueDate)
```

## 🤝 Contributing

When adding features:
1. Follow the existing model patterns
2. Add appropriate indexes
3. Include instance and static methods
4. Update documentation
5. Add tests

## 📝 License

Part of the Nyumbasync project.

---

**Built with ❤️ for real estate professionals who want to own their data and automate their workflow.**

For questions or issues, see the main documentation files.
