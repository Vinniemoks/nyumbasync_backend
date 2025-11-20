# Nyumbasync Data Model Diagram

## The Three-Pillar Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NYUMBASYNC CORE MODELS                          │
│                    The Self-Hosted Real Estate OS                       │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│                      │         │                      │         │                      │
│     PROPERTY         │◄───────►│      CONTACT         │◄───────►│    TRANSACTION       │
│   (The Central       │         │  (The Relationship   │         │  (The Process        │
│      Node)           │         │       Hub)           │         │     Engine)          │
│                      │         │                      │         │                      │
└──────────────────────┘         └──────────────────────┘         └──────────────────────┘
         │                                  │                              │
         │                                  │                              │
         ▼                                  ▼                              ▼
┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ • Address & Specs    │         │ • Multi-role Support │         │ • Pipeline Stages    │
│ • Listing Data       │         │ • Buyer Profile      │         │ • Milestones         │
│ • Investment Metrics │         │ • Seller Profile     │         │ • Tasks              │
│ • Price History      │         │ • Interactions       │         │ • Document Vault     │
│ • Media Gallery      │         │ • Tags               │         │ • Financial Summary  │
│ • Related Contacts   │         │ • Search Criteria    │         │ • Multi-contact      │
│ • Transaction History│         │ • Related Properties │         │ • Notes & Timeline   │
└──────────────────────┘         │ • Related Deals      │         └──────────────────────┘
                                 └──────────────────────┘
```

## Relationship Flow

```
                    ┌─────────────────────────────────────┐
                    │         USER (Agent/Landlord)       │
                    │  • Authentication                   │
                    │  • Role-based Access                │
                    └─────────────────────────────────────┘
                                    │
                                    │ owns/manages
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌──────────────────────┐       ┌──────────────────────┐
        │     PROPERTY         │       │      CONTACT         │
        │                      │       │                      │
        │ relatedContacts[]────┼──────►│ relatedProperties[]  │
        │                      │       │                      │
        │ transactionHistory[] │       │ relatedTransactions[]│
        └──────────┬───────────┘       └──────────┬───────────┘
                   │                              │
                   │                              │
                   │    ┌──────────────────────┐  │
                   │    │   TRANSACTION        │  │
                   └───►│                      │◄─┘
                        │ property             │
                        │ contacts[]           │
                        │ pipeline.stage       │
                        │ milestones[]         │
                        │ tasks[]              │
                        │ documents[]          │
                        └──────────────────────┘
```

## Data Flow Example: Complete Deal

```
STEP 1: Create Property
┌──────────────────────────────────────────────────────────────┐
│ Property: "2BR Apartment in Kilimani"                        │
│ • Address: Kilimani, Nairobi                                 │
│ • Rent: KES 35,000                                           │
│ • Status: Available                                          │
│ • Landlord: John Doe                                         │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 2: Create Buyer Contact
┌──────────────────────────────────────────────────────────────┐
│ Contact: "Sarah Johnson"                                     │
│ • Role: Buyer                                                │
│ • Status: Hot                                                │
│ • Criteria: 2BR, Max 45k, Kilimani/Westlands                │
│ • Tags: ["first-time-renter", "urgent"]                     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 3: Link Contact to Property
┌──────────────────────────────────────────────────────────────┐
│ Property.relatedContacts.push({                              │
│   contact: Sarah,                                            │
│   relationship: "interested"                                 │
│ })                                                           │
│                                                              │
│ Contact.relatedProperties.push({                             │
│   property: 2BR Apartment,                                   │
│   relationship: "interested"                                 │
│ })                                                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 4: Add Interaction
┌──────────────────────────────────────────────────────────────┐
│ Contact.interactions.push({                                  │
│   type: "call",                                              │
│   notes: "Interested in viewing this weekend",              │
│   nextAction: "Schedule showing",                            │
│   nextActionDate: Tomorrow                                   │
│ })                                                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 5: Create Transaction
┌──────────────────────────────────────────────────────────────┐
│ Transaction: "Lease Deal"                                    │
│ • Property: 2BR Apartment                                    │
│ • Contacts: [Sarah (buyer), John (landlord)]                │
│ • Pipeline Stage: "showing_scheduled"                        │
│ • Probability: 40%                                           │
│ • Expected Close: 15 days                                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 6: Add Milestones & Tasks
┌──────────────────────────────────────────────────────────────┐
│ Milestones:                                                  │
│ • Property viewing (2 days)                                  │
│ • Lease signing (10 days)                                    │
│                                                              │
│ Tasks:                                                       │
│ • Schedule property viewing (1 day) - HIGH                   │
│ • Prepare lease agreement (7 days) - MEDIUM                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
STEP 7: Move Through Pipeline
┌──────────────────────────────────────────────────────────────┐
│ showing_scheduled (40%) → offer_made (60%)                   │
│                        → under_contract (75%)                │
│                        → closing (98%)                       │
│                        → closed (100%) ✓                     │
└──────────────────────────────────────────────────────────────┘
```

## The "Sync" Magic in Action

```
┌─────────────────────────────────────────────────────────────────┐
│  CLICK ON PROPERTY                                              │
│  ↓                                                              │
│  Instantly See:                                                 │
│  • All contacts who viewed it                                   │
│  • All contacts who offered on it                               │
│  • Complete transaction history                                 │
│  • Current tenant (if occupied)                                 │
│  • Investment performance                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLICK ON CONTACT                                               │
│  ↓                                                              │
│  Instantly See:                                                 │
│  • All properties they've viewed                                │
│  • All properties they've offered on                            │
│  • All active and past deals                                    │
│  • Complete interaction history                                 │
│  • Next follow-up action                                        │
│  • Saved searches and criteria                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLICK ON TRANSACTION                                           │
│  ↓                                                              │
│  Instantly See:                                                 │
│  • The property details                                         │
│  • All people involved (buyer, seller, agents, etc.)            │
│  • Current pipeline stage                                       │
│  • All milestones and their status                              │
│  • All tasks and assignments                                    │
│  • All documents                                                │
│  • Complete timeline                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Automation Triggers (Flows Engine)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT-DRIVEN AUTOMATION                      │
└─────────────────────────────────────────────────────────────────┘

CONTACT EVENTS                    ACTIONS
─────────────────────────────────────────────────────────────────
contact.created                → Send welcome email
contact.tagged("hot-lead")     → Notify assigned agent
contact.followup.due           → Create reminder task
contact.interaction.added      → Update last contact date

PROPERTY EVENTS                   ACTIONS
─────────────────────────────────────────────────────────────────
property.created               → Index for search
property.listed                → Notify matching buyers
property.price.changed         → Alert interested contacts
property.match.found           → Send instant notification

TRANSACTION EVENTS                ACTIONS
─────────────────────────────────────────────────────────────────
transaction.stage.changed      → Create stage-specific tasks
transaction.milestone.due      → Send reminder (3 days before)
transaction.milestone.overdue  → Escalate to manager
transaction.task.completed     → Update completion %
transaction.closed             → Generate reports, send surveys
```

## Database Indexes for Performance

```
PROPERTY INDEXES
├── Geospatial: address.coordinates (2dsphere)
├── Compound: area + status, type + status, rent + status
├── Single: landlord, featured, subcounty
└── Text: title, description

CONTACT INDEXES
├── Single: email, phone, primaryRole, status, assignedTo
├── Compound: assignedTo + status, primaryRole + status
├── Array: tags
├── Date: nextFollowUpDate
└── Text: firstName, lastName, email

TRANSACTION INDEXES
├── Single: property, dealType, status
├── Compound: user + createdAt, property + createdAt
├── Nested: pipeline.stage, pipeline.expectedCloseDate
├── Array: contacts.contact
└── Date: milestones.dueDate, tasks.dueDate
```

## Model Methods Summary

```
PROPERTY METHODS
├── Instance Methods
│   ├── linkContact(contactId, relationship)
│   ├── calculateInvestmentMetrics()
│   ├── updateListingPrice(newPrice, reason)
│   ├── addToHistory(event, description)
│   ├── markAsOccupied(tenantId, dates)
│   └── markAsAvailable()
└── Static Methods
    ├── findAvailable(filters)
    ├── findByLandlord(landlordId)
    ├── getAreaStats()
    └── getRentStats()

CONTACT METHODS
├── Instance Methods
│   ├── addInteraction(data)
│   ├── addTag(tag) / removeTag(tag)
│   ├── linkProperty(propertyId, relationship)
│   ├── updateBuyerStatus(status)
│   └── setNextFollowUp(date, notes)
└── Static Methods
    ├── findByRole(role)
    ├── findHotLeads()
    ├── findOverdueFollowUps(userId)
    ├── findByTag(tag)
    ├── searchContacts(term)
    └── getContactStats()

TRANSACTION METHODS
├── Instance Methods
│   ├── moveToStage(stage, notes)
│   ├── addMilestone(name, dueDate)
│   ├── completeMilestone(name)
│   ├── addTask(taskData)
│   ├── completeTask(taskId)
│   ├── addDocument(documentData)
│   ├── addContact(contactId, role)
│   ├── addNote(content, userId)
│   ├── getOverdueTasks()
│   └── getOverdueMilestones()
└── Static Methods
    ├── findByContactId(contactId)
    ├── findByStage(stage)
    ├── getActivePipeline()
    ├── getOverdueTransactions()
    ├── getPipelineStats()
    └── getRevenueStats(startDate, endDate)
```

## Next: Build the Flows Engine

With these models in place, implement:

1. **Event Emitters** - Emit events on model changes
2. **Flow Definitions** - JSON configs for automation rules
3. **Flow Processor** - Execute actions based on events
4. **Action Library** - Reusable actions (email, SMS, tasks)
5. **Flow Dashboard** - Monitor and manage automations

The foundation is complete. Time to automate! 🚀
