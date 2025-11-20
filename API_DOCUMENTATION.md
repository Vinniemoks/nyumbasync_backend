# Nyumbasync Backend API Documentation

## Base URL
```
http://localhost:3000/api
```

## API Versions
- **V1**: Legacy API (existing endpoints)
- **V2**: Core Models API (Properties, Contacts, Transactions)
- **Flows**: Flow Engine API

---

## 📋 Table of Contents

1. [Contacts API](#contacts-api)
2. [Properties API](#properties-api)
3. [Transactions API](#transactions-api)
4. [Flows API](#flows-api)
5. [Authentication](#authentication)
6. [Error Handling](#error-handling)

---

## Contacts API

Base path: `/api/contacts`

### Get All Contacts
```http
GET /api/contacts
```

**Query Parameters:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 20)
- `role` (string) - Filter by role (buyer, seller, lead, etc.)
- `status` (string) - Filter by status (active, inactive, archived)
- `tag` (string) - Filter by tag
- `assignedTo` (string) - Filter by assigned user ID
- `search` (string) - Search in name, email, phone
- `sortBy` (string) - Sort field (default: createdAt)
- `sortOrder` (string) - Sort order (asc/desc, default: desc)

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### Get Single Contact
```http
GET /api/contacts/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "254722334455",
    "primaryRole": "buyer",
    "buyerProfile": {...},
    "relatedProperties": [...],
    "relatedTransactions": [...],
    "interactions": [...]
  }
}
```

### Create Contact
```http
POST /api/contacts
```

**Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "254733445566",
  "primaryRole": "buyer",
  "buyerProfile": {
    "status": "hot",
    "criteria": {
      "maxPrice": 50000,
      "locations": ["Kilimani", "Westlands"]
    }
  },
  "tags": ["first-time-buyer"]
}
```

### Update Contact
```http
PUT /api/contacts/:id
```

### Delete Contact
```http
DELETE /api/contacts/:id
```

### Add Tag
```http
POST /api/contacts/:id/tags
```

**Body:**
```json
{
  "tag": "first-time-buyer"
}
```

### Remove Tag
```http
DELETE /api/contacts/:id/tags/:tag
```

### Add Interaction
```http
POST /api/contacts/:id/interactions
```

**Body:**
```json
{
  "type": "call",
  "subject": "Initial consultation",
  "notes": "Discussed budget and preferences",
  "nextAction": "Send property listings",
  "nextActionDate": "2024-01-20T10:00:00Z"
}
```

### Link Property
```http
POST /api/contacts/:id/properties
```

**Body:**
```json
{
  "propertyId": "...",
  "relationship": "interested",
  "notes": "Loved the kitchen"
}
```

### Update Buyer Status
```http
PUT /api/contacts/:id/buyer-status
```

**Body:**
```json
{
  "status": "hot"
}
```

### Schedule Follow-up
```http
POST /api/contacts/:id/follow-up
```

**Body:**
```json
{
  "date": "2024-01-25T14:00:00Z",
  "notes": "Check in on home search progress"
}
```

### Get Hot Leads
```http
GET /api/contacts/hot-leads
```

### Get Overdue Follow-ups
```http
GET /api/contacts/overdue-followups?assignedTo=userId
```

### Get Contacts by Tag
```http
GET /api/contacts/by-tag/:tag
```

### Search Contacts
```http
GET /api/contacts/search?q=john
```

### Get Contact Statistics
```http
GET /api/contacts/stats
```

---

## Properties API

Base path: `/api/v2/properties`

### Get All Properties
```http
GET /api/v2/properties
```

**Query Parameters:**
- `page`, `limit` - Pagination
- `status` - Filter by status (available, occupied, maintenance)
- `type` - Filter by type (apartment, house, etc.)
- `area` - Filter by area
- `city` - Filter by city
- `minRent`, `maxRent` - Rent range
- `bedrooms`, `bathrooms` - Number of rooms
- `amenities` - Comma-separated amenities
- `landlord` - Filter by landlord ID
- `search` - Search in title, description, area
- `sortBy`, `sortOrder` - Sorting

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

### Get Single Property
```http
GET /api/v2/properties/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "title": "2BR Apartment in Kilimani",
    "type": "apartment",
    "bedrooms": 2,
    "bathrooms": 1,
    "address": {...},
    "rent": {
      "amount": 35000,
      "currency": "KES"
    },
    "investment": {
      "capRate": 8.5,
      "cashFlow": 5000,
      "roi": 12.3
    },
    "relatedContacts": [...],
    "transactionHistory": [...]
  }
}
```

### Create Property
```http
POST /api/v2/properties
```

**Body:**
```json
{
  "title": "3BR House in Westlands",
  "description": "Spacious house with garden...",
  "type": "house",
  "bedrooms": 3,
  "bathrooms": 2,
  "squareFootage": 1500,
  "address": {
    "street": "123 Main St",
    "area": "Westlands",
    "city": "Nairobi",
    "county": "Nairobi"
  },
  "rent": {
    "amount": 65000
  },
  "deposit": 130000,
  "landlord": "userId",
  "amenities": ["parking", "security", "garden"]
}
```

### Update Property
```http
PUT /api/v2/properties/:id
```

### Delete Property
```http
DELETE /api/v2/properties/:id
```

### Get Available Properties
```http
GET /api/v2/properties/available?area=Kilimani&maxRent=50000
```

### Link Contact
```http
POST /api/v2/properties/:id/contacts
```

**Body:**
```json
{
  "contactId": "...",
  "relationship": "interested",
  "notes": "Scheduled viewing"
}
```

### Update Listing Price
```http
PUT /api/v2/properties/:id/price
```

**Body:**
```json
{
  "newPrice": 60000,
  "reason": "Market adjustment"
}
```

### Calculate Investment Metrics
```http
POST /api/v2/properties/:id/calculate-metrics
```

**Body (optional):**
```json
{
  "investment": {
    "purchasePrice": 8000000,
    "renovationCosts": 500000,
    "projectedRentalIncome": 65000
  }
}
```

### Mark as Occupied
```http
POST /api/v2/properties/:id/occupy
```

**Body:**
```json
{
  "tenantId": "...",
  "leaseStart": "2024-02-01",
  "leaseEnd": "2025-02-01",
  "rentDueDate": 1
}
```

### Mark as Available
```http
POST /api/v2/properties/:id/vacate
```

### Get Properties by Landlord
```http
GET /api/v2/properties/by-landlord/:landlordId
```

### Get Area Statistics
```http
GET /api/v2/properties/stats/areas
```

### Get Rent Statistics
```http
GET /api/v2/properties/stats/rent
```

---

## Transactions API

Base path: `/api/v2/transactions`

### Get All Transactions
```http
GET /api/v2/transactions
```

**Query Parameters:**
- `page`, `limit` - Pagination
- `dealType` - Filter by deal type (sale, lease, etc.)
- `stage` - Filter by pipeline stage
- `status` - Filter by status
- `property` - Filter by property ID
- `contact` - Filter by contact ID
- `sortBy`, `sortOrder` - Sorting

### Get Single Transaction
```http
GET /api/v2/transactions/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "dealType": "lease",
    "property": {...},
    "contacts": [...],
    "pipeline": {
      "stage": "under_contract",
      "probability": 75,
      "expectedCloseDate": "2024-02-15"
    },
    "milestones": [...],
    "tasks": [...],
    "documents": [...],
    "notes": [...]
  }
}
```

### Create Transaction
```http
POST /api/v2/transactions
```

**Body:**
```json
{
  "dealType": "lease",
  "property": "propertyId",
  "amount": 35000,
  "type": "rent",
  "description": "Lease agreement for 2BR apartment",
  "pipeline": {
    "stage": "lead",
    "expectedCloseDate": "2024-03-01"
  }
}
```

### Update Transaction
```http
PUT /api/v2/transactions/:id
```

### Delete Transaction
```http
DELETE /api/v2/transactions/:id
```

### Move to Stage
```http
PUT /api/v2/transactions/:id/stage
```

**Body:**
```json
{
  "stage": "under_contract",
  "notes": "Offer accepted"
}
```

### Add Milestone
```http
POST /api/v2/transactions/:id/milestones
```

**Body:**
```json
{
  "name": "Property Inspection",
  "dueDate": "2024-01-30",
  "assignedTo": "userId"
}
```

### Complete Milestone
```http
PUT /api/v2/transactions/:id/milestones/:milestoneName/complete
```

### Add Task
```http
POST /api/v2/transactions/:id/tasks
```

**Body:**
```json
{
  "title": "Schedule inspection",
  "description": "Contact inspector and coordinate with buyer",
  "dueDate": "2024-01-25",
  "priority": "high",
  "assignedTo": "userId"
}
```

### Complete Task
```http
PUT /api/v2/transactions/:id/tasks/:taskId/complete
```

### Add Document
```http
POST /api/v2/transactions/:id/documents
```

**Body:**
```json
{
  "name": "Lease Agreement",
  "type": "contract",
  "url": "https://storage.example.com/lease-123.pdf",
  "size": 245678,
  "mimeType": "application/pdf"
}
```

### Add Note
```http
POST /api/v2/transactions/:id/notes
```

**Body:**
```json
{
  "content": "Buyer requested early move-in",
  "isPrivate": false
}
```

### Add Contact
```http
POST /api/v2/transactions/:id/contacts
```

**Body:**
```json
{
  "contactId": "...",
  "role": "buyer",
  "isPrimary": true
}
```

### Get Transactions by Stage
```http
GET /api/v2/transactions/by-stage/:stage
```

### Get Active Pipeline
```http
GET /api/v2/transactions/pipeline/active
```

### Get Overdue Transactions
```http
GET /api/v2/transactions/overdue
```

### Get Pipeline Statistics
```http
GET /api/v2/transactions/stats/pipeline
```

### Get Transactions by Contact
```http
GET /api/v2/transactions/by-contact/:contactId?stage=under_contract
```

---

## Flows API

Base path: `/api/flows`

### Get All Flows
```http
GET /api/flows
```

### Get Flow Statistics
```http
GET /api/flows/stats
```

### Get Single Flow
```http
GET /api/flows/:flowId
```

### Register New Flow
```http
POST /api/flows
```

**Body:**
```json
{
  "id": "my-custom-flow",
  "name": "My Custom Flow",
  "trigger": {
    "event": "contact.created"
  },
  "conditions": [
    {
      "field": "contact.primaryRole",
      "operator": "equals",
      "value": "buyer"
    }
  ],
  "actions": [
    {
      "type": "sendEmail",
      "params": {
        "to": "{{contact.email}}",
        "subject": "Welcome!",
        "template": "welcome"
      }
    }
  ],
  "enabled": true
}
```

### Enable Flow
```http
PUT /api/flows/:flowId/enable
```

### Disable Flow
```http
PUT /api/flows/:flowId/disable
```

### Delete Flow
```http
DELETE /api/flows/:flowId
```

### Get Execution History
```http
GET /api/flows/history/recent?limit=50
```

### Manually Trigger Event
```http
POST /api/flows/trigger
```

**Body:**
```json
{
  "eventName": "contact.created",
  "eventData": {
    "contact": {...},
    "contactId": "..."
  }
}
```

---

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

---

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Standard**: 100 requests per 15 minutes
- **Search**: 30 requests per 15 minutes

---

## Pagination

All list endpoints support pagination:

**Request:**
```http
GET /api/contacts?page=2&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 250,
    "pages": 5
  }
}
```

---

## Filtering & Sorting

Most list endpoints support filtering and sorting:

**Filtering:**
```http
GET /api/contacts?role=buyer&status=active&tag=hot-lead
```

**Sorting:**
```http
GET /api/contacts?sortBy=createdAt&sortOrder=desc
```

**Search:**
```http
GET /api/contacts?search=john
```

---

## Examples

### Complete Deal Flow

```javascript
// 1. Create property
const property = await fetch('/api/v2/properties', {
  method: 'POST',
  body: JSON.stringify({
    title: '2BR Apartment',
    type: 'apartment',
    bedrooms: 2,
    address: { area: 'Kilimani', city: 'Nairobi' },
    rent: { amount: 35000 },
    landlord: landlordId
  })
});

// 2. Create buyer contact
const buyer = await fetch('/api/contacts', {
  method: 'POST',
  body: JSON.stringify({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '254722334455',
    primaryRole: 'buyer'
  })
});

// 3. Link buyer to property
await fetch(`/api/contacts/${buyer.data._id}/properties`, {
  method: 'POST',
  body: JSON.stringify({
    propertyId: property.data._id,
    relationship: 'interested'
  })
});

// 4. Create transaction
const deal = await fetch('/api/v2/transactions', {
  method: 'POST',
  body: JSON.stringify({
    dealType: 'lease',
    property: property.data._id,
    amount: 35000
  })
});

// 5. Add buyer to transaction
await fetch(`/api/v2/transactions/${deal.data._id}/contacts`, {
  method: 'POST',
  body: JSON.stringify({
    contactId: buyer.data._id,
    role: 'buyer',
    isPrimary: true
  })
});

// 6. Move to showing scheduled
await fetch(`/api/v2/transactions/${deal.data._id}/stage`, {
  method: 'PUT',
  body: JSON.stringify({
    stage: 'showing_scheduled',
    notes: 'Showing set for tomorrow'
  })
});
```

---

## Postman Collection

Import the Postman collection for easy testing:
[Download Postman Collection](#)

---

## Support

For API support, contact: support@nyumbasync.com
