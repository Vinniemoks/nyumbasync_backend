# Landlord Portal Quick Start Guide

## Getting Started

### Prerequisites
- NyumbaSync backend running
- Super admin account
- Postman or similar API client

## Step-by-Step Setup

### 1. Create Landlord Account (Super Admin)

**Endpoint:** `POST /landlord/accounts`

**Headers:**
```
Authorization: Bearer <super_admin_token>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "landlord@example.com",
  "phone": "254712345678",
  "firstName": "John",
  "lastName": "Doe",
  "accountType": "primary_landlord"
}
```

**Response:**
```json
{
  "message": "Landlord account created successfully",
  "user": {
    "id": "user_id",
    "email": "landlord@example.com",
    "phone": "254712345678",
    "accountType": "primary_landlord"
  }
}
```

The landlord will receive an email with temporary credentials.

### 2. Login as Landlord

**Endpoint:** `POST /api/login`

**Body:**
```json
{
  "email": "landlord@example.com",
  "password": "temporary_password"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": { ... }
}
```

Save the token for subsequent requests.

### 3. Setup Two-Factor Authentication

**Endpoint:** `POST /landlord/2fa/setup`

**Headers:**
```
Authorization: Bearer <landlord_token>
```

**Response:**
```json
{
  "message": "2FA setup initiated",
  "secret": "base32_secret",
  "qrCode": "data:image/png;base64,...",
  "backupCodes": [
    "CODE1",
    "CODE2",
    ...
  ]
}
```

1. Scan the QR code with Google Authenticator or Authy
2. Save the backup codes securely
3. Verify 2FA with the next step

### 4. Verify and Enable 2FA

**Endpoint:** `POST /landlord/2fa/verify`

**Headers:**
```
Authorization: Bearer <landlord_token>
```

**Body:**
```json
{
  "token": "123456"
}
```

Enter the 6-digit code from your authenticator app.

### 5. Accept Service Agreement

**Endpoint:** `POST /landlord/service-agreement/accept`

**Headers:**
```
Authorization: Bearer <landlord_token>
```

**Body:**
```json
{
  "version": "1.0",
  "digitalSignature": "John Doe"
}
```

### 6. Register Your First Property

**Endpoint:** `POST /landlord/properties`

**Headers:**
```
Authorization: Bearer <landlord_token>
```

**Body:**
```json
{
  "title": "Modern 2BR Apartment in Westlands",
  "description": "Beautiful apartment with modern amenities...",
  "type": "apartment",
  "bedrooms": 2,
  "bathrooms": 2,
  "rent": {
    "amount": 50000,
    "currency": "KES"
  },
  "deposit": 100000,
  "address": {
    "street": "Waiyaki Way",
    "area": "Westlands",
    "city": "Nairobi",
    "county": "Nairobi"
  },
  "amenities": ["parking", "security", "wifi", "gym"],
  "images": [
    {
      "url": "https://example.com/image1.jpg",
      "isPrimary": true
    }
  ]
}
```

### 7. Upload Verification Documents

**Endpoint:** `POST /landlord/verification/documents`

**Headers:**
```
Authorization: Bearer <landlord_token>
```

**Body:**
```json
{
  "documentType": "title_deed",
  "url": "https://example.com/documents/title_deed.pdf"
}
```

Repeat for other documents:
- `tax_bill`
- `certificate_of_occupancy`
- `insurance`
- `kra_pin`
- `id_document`

## Common Operations

### Create a Vendor

**Endpoint:** `POST /landlord/vendors`

**Body:**
```json
{
  "name": "John's Plumbing Services",
  "category": "plumber",
  "contact": {
    "phone": "254722123456",
    "email": "john@plumbing.com"
  },
  "pricing": {
    "hourlyRate": 2000,
    "callOutFee": 1000
  },
  "isPreferred": true
}
```

### Create an Automation Workflow

**Endpoint:** `POST /landlord/workflows`

**Body:**
```json
{
  "name": "Rent Reminder - 3 Days Before Due",
  "description": "Send SMS reminder 3 days before rent is due",
  "status": "active",
  "trigger": {
    "type": "date_based",
    "dateBased": {
      "field": "rentDueDate",
      "daysBeforeAfter": 3,
      "direction": "before"
    }
  },
  "actions": [
    {
      "type": "send_sms",
      "sms": {
        "to": "{{tenantPhone}}",
        "message": "Reminder: Your rent of KES {{rentAmount}} is due in 3 days."
      },
      "order": 1
    }
  ]
}
```

### View Financial Dashboard

**Endpoint:** `GET /landlord/financial/dashboard?startDate=2024-01-01&endDate=2024-12-31`

**Response:**
```json
{
  "summary": {
    "totalIncome": 600000,
    "totalExpenses": 150000,
    "netOperatingIncome": 450000,
    "occupancyRate": 85.5,
    "totalProperties": 5
  },
  "properties": [...]
}
```

### Get Maintenance Requests

**Endpoint:** `GET /landlord/maintenance/requests?status=pending&page=1&limit=20`

**Response:**
```json
{
  "requests": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### Assign Vendor to Maintenance Request

**Endpoint:** `PUT /landlord/maintenance/requests/:requestId/assign-vendor`

**Body:**
```json
{
  "vendorId": "vendor_id_here"
}
```

### Create Sub-Account (Staff/Manager)

**Endpoint:** `POST /landlord/sub-accounts`

**Body:**
```json
{
  "email": "manager@example.com",
  "phone": "254733123456",
  "firstName": "Jane",
  "lastName": "Smith",
  "accountType": "property_manager",
  "permissions": {
    "properties": { "view": true, "edit": true, "delete": false },
    "financial": { "view": true, "edit": false, "export": false },
    "tenants": { "view": true, "edit": true, "communicate": true },
    "maintenance": { "view": true, "assign": true, "approve": false }
  },
  "assignedProperties": ["property_id_1", "property_id_2"]
}
```

### Bulk Import Properties

**Endpoint:** `POST /landlord/properties/bulk-import`

**Body:**
```json
{
  "properties": [
    {
      "title": "Property 1",
      "type": "apartment",
      "bedrooms": 2,
      "bathrooms": 1,
      "rent": { "amount": 30000 },
      "address": { ... }
    },
    {
      "title": "Property 2",
      "type": "house",
      "bedrooms": 3,
      "bathrooms": 2,
      "rent": { "amount": 45000 },
      "address": { ... }
    }
  ]
}
```

### Get CRM Contacts

**Endpoint:** `GET /landlord/contacts?stage=prospect&search=john&page=1&limit=20`

**Query Parameters:**
- `stage`: lead, prospect, applicant, approved, leased, former_tenant
- `search`: Search by name, email, or phone
- `page`: Page number
- `limit`: Results per page

### Upload Document

**Endpoint:** `POST /landlord/documents`

**Body:**
```json
{
  "title": "Lease Agreement - Unit 5A",
  "category": "lease",
  "url": "https://example.com/documents/lease_5a.pdf",
  "propertyId": "property_id_here",
  "tenantId": "tenant_id_here"
}
```

### Get Dashboard Analytics

**Endpoint:** `GET /landlord/analytics/dashboard`

**Response:**
```json
{
  "portfolio": {
    "totalProperties": 10,
    "totalUnits": 45,
    "occupiedUnits": 38,
    "totalValue": 50000000
  },
  "occupancyRate": 84.44,
  "totalProperties": 10,
  "recentTransactions": [...],
  "pendingMaintenance": 5
}
```

## Workflow Examples

### 1. Late Payment Notification

```json
{
  "name": "Late Payment Alert",
  "trigger": {
    "type": "date_based",
    "dateBased": {
      "field": "rentDueDate",
      "daysBeforeAfter": 1,
      "direction": "after"
    }
  },
  "actions": [
    {
      "type": "send_sms",
      "sms": {
        "to": "{{tenantPhone}}",
        "message": "Your rent payment is overdue. Please pay immediately to avoid late fees."
      }
    },
    {
      "type": "send_email",
      "email": {
        "to": "{{tenantEmail}}",
        "subject": "Rent Payment Overdue",
        "body": "Dear {{tenantName}}, your rent payment is overdue..."
      }
    }
  ]
}
```

### 2. Lease Expiration Alert

```json
{
  "name": "Lease Expiring Soon",
  "trigger": {
    "type": "date_based",
    "dateBased": {
      "field": "leaseEndDate",
      "daysBeforeAfter": 60,
      "direction": "before"
    }
  },
  "actions": [
    {
      "type": "notify_user",
      "notification": {
        "recipient": "{{landlordId}}",
        "message": "Lease for {{propertyTitle}} expires in 60 days",
        "type": "warning"
      }
    },
    {
      "type": "create_task",
      "task": {
        "title": "Contact tenant about lease renewal",
        "description": "Reach out to {{tenantName}} about renewing lease",
        "priority": "high"
      }
    }
  ]
}
```

### 3. Maintenance Request Auto-Assignment

```json
{
  "name": "Auto-Assign Plumbing Issues",
  "trigger": {
    "type": "event",
    "event": "maintenance_requested"
  },
  "conditions": [
    {
      "field": "category",
      "operator": "equals",
      "value": "plumbing"
    }
  ],
  "actions": [
    {
      "type": "update_record",
      "update": {
        "model": "MaintenanceRequest",
        "field": "assignedVendor",
        "value": "preferred_plumber_id"
      }
    },
    {
      "type": "send_sms",
      "sms": {
        "to": "{{vendorPhone}}",
        "message": "New plumbing request at {{propertyAddress}}"
      }
    }
  ]
}
```

## Permission Levels

### Primary Landlord
Full access to all features and data.

### Property Manager
```json
{
  "properties": { "view": true, "edit": true, "delete": false },
  "financial": { "view": true, "edit": false, "export": true },
  "tenants": { "view": true, "edit": true, "communicate": true },
  "maintenance": { "view": true, "assign": true, "approve": true },
  "documents": { "view": true, "upload": true, "delete": false },
  "reports": { "view": true, "generate": true, "export": true },
  "settings": { "view": true, "edit": false },
  "users": { "create": false, "edit": false, "delete": false }
}
```

### Staff/Assistant
```json
{
  "properties": { "view": true, "edit": false, "delete": false },
  "financial": { "view": false, "edit": false, "export": false },
  "tenants": { "view": true, "edit": false, "communicate": true },
  "maintenance": { "view": true, "assign": false, "approve": false },
  "documents": { "view": true, "upload": false, "delete": false },
  "reports": { "view": true, "generate": false, "export": false },
  "settings": { "view": false, "edit": false },
  "users": { "create": false, "edit": false, "delete": false }
}
```

## Best Practices

1. **Always enable 2FA** for all landlord accounts
2. **Use workflows** to automate repetitive tasks
3. **Regular backups** of important documents
4. **Review vendor performance** regularly
5. **Keep verification documents** up to date
6. **Monitor financial dashboard** weekly
7. **Respond to maintenance requests** within 24 hours
8. **Use sub-accounts** for staff with appropriate permissions
9. **Set up automated reminders** for rent collection
10. **Track all expenses** for accurate reporting

## Troubleshooting

### 2FA Not Working
- Ensure your device time is synchronized
- Try using a backup code
- Contact support to reset 2FA

### Cannot Create Sub-Account
- Verify you have primary_landlord account type
- Check that email/phone is not already in use

### Workflow Not Executing
- Check workflow status is "active"
- Verify trigger conditions are met
- Review execution history for errors

### Permission Denied
- Verify your account type and permissions
- Contact primary landlord to update permissions

## Support

For additional help:
- Email: support@nyumbasync.com
- Documentation: https://docs.nyumbasync.com
- API Reference: https://api.nyumbasync.com/docs

## Next Steps

1. Complete property verification
2. Set up automated workflows
3. Add vendors to your database
4. Create sub-accounts for staff
5. Configure bank integration
6. Generate your first financial report

Happy property managing! 🏠
