# NyumbaSync Backend API Reference

## Overview

This document provides a complete reference of all API endpoints that the NyumbaSync frontend (web, mobile, and desktop) expects from the backend. Use this as a specification to implement your backend API.

**Base URL**: `http://localhost:3001/api` (development)

**Production URL**: `https://api.nyumbasync.com/api`

## Table of Contents

1. [Authentication](#authentication)
2. [Properties](#properties)
3. [Tenants](#tenants)
4. [Payments](#payments)
5. [Maintenance](#maintenance)
6. [Leases](#leases)
7. [Documents](#documents)
8. [Notifications](#notifications)
9. [Messages](#messages)
10. [Analytics](#analytics)
11. [Vendors](#vendors)
12. [Move-Out](#move-out)
13. [Deposit Refund](#deposit-refund)
14. [Admin](#admin)
15. [WebSocket Events](#websocket-events)

---

## Authentication

### POST /auth/login
Login user with email/phone and password.

**Request Body:**
```json
{
  "identifier": "user@example.com",  // or phone: "+254712345678"
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "tenant",  // tenant, landlord, agent, manager, vendor, admin
    "phone": "+254712345678",
    "mfaEnabled": false
  }
}
```

### POST /auth/signup
Register a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "email": "user@example.com",
  "password": "password123",
  "phoneNumber": "+254712345678",
  "idNumber": "12345678",
  "role": "tenant",
  "userType": "tenant"
}
```

**Response:**
```json
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "tenant",
    "phone": "+254712345678"
  }
}
```

### POST /auth/logout
Logout user and invalidate tokens.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response:**
```json
{
  "token": "new_jwt_access_token",
  "expiresIn": 3600
}
```

### GET /auth/me
Get current authenticated user.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "tenant",
  "phone": "+254712345678",
  "mfaEnabled": false
}
```

### POST /auth/forgot-password
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

### POST /auth/reset-password
Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "new_password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### POST /auth/change-password
Change password for authenticated user.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Properties

### GET /properties
Get all properties (filtered by user role).

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `landlordId` (optional): Filter by landlord
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
[
  {
    "id": 1,
    "name": "Sunset Apartments",
    "address": "123 Main St, Nairobi",
    "type": "apartment",
    "units": 10,
    "occupied": 8,
    "occupancy": 80,
    "monthlyRent": 50000,
    "image": "/images/property1.jpg"
  }
]
```

### GET /properties/:id
Get property details by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "address": "123 Main St, Nairobi",
  "unitNumber": "A1",
  "propertyType": "apartment",
  "squareFootage": 1200,
  "bedrooms": 2,
  "bathrooms": 2,
  "amenities": ["Parking", "Gym", "Pool", "Security"],
  "images": ["/images/property1.jpg"],
  "stakeholder": {
    "name": "Property Manager",
    "email": "manager@example.com",
    "phone": "+254712345670",
    "role": "manager"
  }
}
```

### POST /properties
Create a new property.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "Sunset Apartments",
  "address": "123 Main St, Nairobi",
  "type": "apartment",
  "units": 10,
  "monthlyRent": 50000,
  "description": "Modern apartments with amenities"
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Sunset Apartments",
  "address": "123 Main St, Nairobi",
  "type": "apartment",
  "units": 10,
  "occupied": 0,
  "occupancy": 0,
  "monthlyRent": 50000
}
```

### PUT /properties/:id
Update property details.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "Updated Name",
  "monthlyRent": 55000
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Updated Name",
  "monthlyRent": 55000
}
```

### DELETE /properties/:id
Delete a property.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "message": "Property deleted successfully"
}
```

### GET /properties/landlord/:landlordId
Get properties by landlord ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of properties (same format as GET /properties)

### GET /properties/:propertyId/units
Get units for a property.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "unitNumber": "A1",
    "bedrooms": 2,
    "bathrooms": 2,
    "rent": 50000,
    "occupied": true,
    "tenantId": 1
  }
]
```

### POST /properties/:propertyId/units
Add a unit to a property.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "unitNumber": "A1",
  "bedrooms": 2,
  "bathrooms": 2,
  "rent": 50000
}
```

**Response:**
```json
{
  "id": 1,
  "unitNumber": "A1",
  "bedrooms": 2,
  "bathrooms": 2,
  "rent": 50000,
  "occupied": false
}
```

### PUT /properties/:propertyId/units/:unitId
Update a unit.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "rent": 55000
}
```

**Response:** Updated unit object

### DELETE /properties/:propertyId/units/:unitId
Delete a unit.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /properties/:propertyId/stats
Get property statistics.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalUnits": 10,
  "occupiedUnits": 8,
  "vacantUnits": 2,
  "occupancyRate": 80,
  "monthlyIncome": 400000,
  "pendingPayments": 50000
}
```

### POST /properties/:propertyId/images
Upload property images.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file

**Response:**
```json
{
  "success": true,
  "imageUrl": "/uploads/property1.jpg"
}
```

---

## Tenants

### GET /tenants
Get all tenants.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `landlordId` (optional)
- `propertyId` (optional)

**Response:**
```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "tenant@example.com",
    "phone": "+254712345678",
    "propertyId": 1,
    "unitNumber": "A1",
    "rentAmount": 50000,
    "leaseStart": "2024-01-01",
    "leaseEnd": "2025-01-01",
    "status": "active"
  }
]
```

### GET /tenants/:id
Get tenant by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single tenant object (same format as above)

### POST /tenants
Create a new tenant.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "tenant@example.com",
  "phone": "+254712345678",
  "propertyId": 1,
  "unitNumber": "A1",
  "rentAmount": 50000,
  "leaseStart": "2024-01-01",
  "leaseEnd": "2025-01-01"
}
```

**Response:** Created tenant object

### PUT /tenants/:id
Update tenant details.

**Headers:** `Authorization: Bearer {token}`

**Request Body:** Fields to update

**Response:** Updated tenant object

### DELETE /tenants/:id
Delete a tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /tenants/landlord/:landlordId
Get tenants by landlord.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of tenants

### GET /tenants/property/:propertyId
Get tenants by property.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of tenants

### GET /tenants/:tenantId/payments
Get payments for a tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of payment objects

### POST /tenants/:tenantId/remind
Send rent reminder to tenant.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "method": "email"  // or "sms"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reminder sent successfully"
}
```

### POST /tenants/:tenantId/terminate
Terminate tenant lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "terminationDate": "2024-12-31",
  "reason": "End of lease"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /tenants/:tenantId/renew
Renew tenant lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "newLeaseEnd": "2026-01-01",
  "newRentAmount": 55000
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /tenants/:tenantId/stats
Get tenant statistics.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalPayments": 600000,
  "pendingPayments": 50000,
  "maintenanceRequests": 5,
  "leaseEndDate": "2025-01-01"
}
```

### GET /tenant/profile
Get current tenant's profile.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "userId": 1,
  "firstName": "John",
  "lastName": "Doe",
  "email": "tenant@example.com",
  "phoneNumber": "+254712345678",
  "currentPropertyId": 1,
  "currentLeaseId": 1,
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+254712345679",
    "relationship": "Spouse"
  },
  "preferences": {
    "notifications": true,
    "autoPayEnabled": false
  }
}
```

---

## Payments

### GET /payments
Get all payments.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `tenantId` (optional)
- `propertyId` (optional)
- `status` (optional): pending, paid, failed

**Response:**
```json
[
  {
    "id": 1,
    "tenantId": 1,
    "propertyId": 1,
    "amount": 50000,
    "status": "paid",
    "paymentMethod": "mpesa",
    "transactionId": "MPE123456",
    "date": "2024-01-01T00:00:00Z",
    "dueDate": "2024-01-05T00:00:00Z"
  }
]
```

### GET /payments/:id
Get payment by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single payment object

### POST /payments
Create a payment record.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "tenantId": 1,
  "propertyId": 1,
  "amount": 50000,
  "paymentMethod": "mpesa",
  "transactionId": "MPE123456"
}
```

**Response:** Created payment object

### POST /payments/mpesa/stk-push
Initiate M-Pesa STK Push payment.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "phoneNumber": "+254712345678",
  "amount": 50000,
  "accountReference": "RENT-001",
  "description": "Rent payment for January 2024"
}
```

**Response:**
```json
{
  "success": true,
  "checkoutRequestId": "ws_CO_123456789",
  "merchantRequestId": "12345-67890-1",
  "responseCode": "0",
  "responseDescription": "Success. Request accepted for processing",
  "customerMessage": "Success. Request accepted for processing"
}
```

### POST /payments/mpesa/paybill
Generate M-Pesa Paybill payment code.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "tenantId": 1,
  "amount": 50000
}
```

**Response:**
```json
{
  "success": true,
  "paybillNumber": "123456",
  "accountNumber": "RENT-001-123",
  "amount": 50000,
  "instructions": "Pay via M-Pesa Paybill..."
}
```

### GET /payments/mpesa/verify/:transactionId
Verify M-Pesa payment status.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "transactionId": "MPE123456",
  "status": "completed",
  "amount": 50000,
  "phoneNumber": "+254712345678",
  "transactionDate": "2024-01-01T10:30:00Z"
}
```

### POST /payments/card
Initiate card payment (Stripe/Flutterwave).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "amount": 50000,
  "currency": "KES",
  "cardDetails": {
    "number": "4242424242424242",
    "expMonth": "12",
    "expYear": "2025",
    "cvc": "123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "card_123456",
  "status": "success"
}
```

### POST /payments/bank-transfer
Initiate bank transfer payment.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "amount": 50000,
  "bankDetails": {
    "accountNumber": "1234567890",
    "bankName": "KCB Bank"
  }
}
```

**Response:**
```json
{
  "success": true,
  "referenceNumber": "BT123456",
  "instructions": "Transfer to account..."
}
```

### GET /payments/:paymentId/instructions
Get payment instructions.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "paymentMethod": "bank_transfer",
  "instructions": "Transfer to account 1234567890...",
  "accountDetails": {
    "accountNumber": "1234567890",
    "bankName": "KCB Bank",
    "accountName": "NyumbaSync Ltd"
  }
}
```

### POST /payments/:paymentId/confirm
Confirm manual payment (bank transfer).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "transactionReference": "BT123456",
  "proofOfPayment": "base64_image_or_url"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment confirmation submitted"
}
```

### GET /payments/history/:tenantId
Get payment history for tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of payment objects

---

## Maintenance

### GET /maintenance
Get all maintenance requests.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `propertyId` (optional)
- `status` (optional): submitted, assigned, in_progress, completed, cancelled

**Response:**
```json
[
  {
    "id": 1,
    "ticketNumber": "TKT-12345678-001",
    "title": "Leaking faucet",
    "description": "Kitchen faucet is leaking",
    "category": "plumbing",
    "priority": "high",
    "status": "submitted",
    "propertyId": 1,
    "tenantId": 1,
    "date": "2024-01-01",
    "time": "10:30 AM",
    "createdAt": "2024-01-01T10:30:00Z"
  }
]
```

### GET /maintenance/:id
Get maintenance request by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single maintenance request object

### GET /tenant/maintenance
Get maintenance requests for current tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of maintenance requests

### GET /tenant/maintenance/:id
Get specific maintenance request for tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "ticketNumber": "TKT-12345678-001",
  "title": "Leaking faucet",
  "description": "Kitchen faucet is leaking",
  "category": "plumbing",
  "priority": "high",
  "status": "assigned",
  "date": "2024-01-01",
  "createdAt": "2024-01-01T10:30:00Z",
  "statusHistory": [
    {
      "status": "submitted",
      "timestamp": "2024-01-01T10:30:00Z",
      "note": "Request submitted"
    },
    {
      "status": "assigned",
      "timestamp": "2024-01-01T11:00:00Z",
      "note": "Vendor assigned"
    }
  ],
  "assignedVendor": {
    "id": 1,
    "name": "John's Plumbing",
    "phone": "+254722111222",
    "estimatedArrival": "Within 24 hours"
  }
}
```

### POST /tenant/maintenance
Create maintenance request.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "title": "Leaking faucet",
  "description": "Kitchen faucet is leaking",
  "category": "plumbing",
  "priority": "high",
  "propertyId": 1
}
```

**Response:** Created maintenance request object

### PUT /tenant/maintenance/:id
Update maintenance request.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "status": "cancelled",
  "note": "Issue resolved"
}
```

**Response:** Updated maintenance request

### POST /maintenance/:id/photos
Upload photos for maintenance request.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file

**Response:**
```json
{
  "success": true,
  "photoUrl": "/uploads/maintenance1.jpg"
}
```

### POST /tenant/maintenance/:id/rate
Rate completed maintenance request.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "rating": 5,
  "feedback": "Excellent service"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Thank you for your feedback!"
}
```

---

## Leases

### GET /leases
Get all leases.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "tenantId": 1,
    "propertyId": 1,
    "startDate": "2024-01-01",
    "endDate": "2025-01-01",
    "monthlyRent": 50000,
    "securityDeposit": 50000,
    "status": "active",
    "documentUrl": "/documents/lease1.pdf"
  }
]
```

### GET /leases/:id
Get lease by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single lease object

### POST /leases
Create a new lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "tenantId": 1,
  "propertyId": 1,
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "monthlyRent": 50000,
  "securityDeposit": 50000
}
```

**Response:** Created lease object

### PUT /leases/:id
Update lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:** Fields to update

**Response:** Updated lease object

### DELETE /leases/:id
Delete lease.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /leases/landlord/:landlordId
Get leases by landlord.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of leases

### GET /leases/tenant/:tenantId
Get leases by tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of leases

### GET /leases/property/:propertyId
Get leases by property.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of leases

### POST /leases/:leaseId/sign
Sign a lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "signature": "base64_signature",
  "signedDate": "2024-01-01"
}
```

**Response:**
```json
{
  "success": true,
  "lease": { /* updated lease object */ }
}
```

### POST /leases/:leaseId/renew
Renew a lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "newEndDate": "2026-01-01",
  "newMonthlyRent": 55000
}
```

**Response:** Renewed lease object

### POST /leases/:leaseId/terminate
Terminate a lease.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "terminationDate": "2024-12-31",
  "reason": "End of lease"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /leases/:leaseId/documents
Get documents for a lease.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "name": "Lease Agreement.pdf",
    "url": "/documents/lease1.pdf",
    "uploadedAt": "2024-01-01T00:00:00Z"
  }
]
```

### POST /leases/:leaseId/documents
Upload lease document.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file

**Response:**
```json
{
  "success": true,
  "document": { /* document object */ }
}
```

### GET /leases/:leaseId/documents/:documentId
Get specific lease document.

**Headers:** `Authorization: Bearer {token}`

**Response:** Document object

### GET /leases/:leaseId/documents/:documentId/download
Download lease document.

**Headers:** `Authorization: Bearer {token}`

**Response:** File download

### GET /leases/templates
Get lease templates.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "name": "Standard Residential Lease",
    "description": "Standard lease agreement for residential properties"
  }
]
```

### POST /leases/templates/:templateId/generate
Generate lease from template.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "tenantId": 1,
  "propertyId": 1,
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "monthlyRent": 50000
}
```

**Response:** Generated lease object

---

## Documents

### GET /documents
Get all documents.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "name": "Lease Agreement.pdf",
    "category": "lease",
    "fileUrl": "/documents/lease1.pdf",
    "fileType": "application/pdf",
    "fileSize": 2457600,
    "uploadedAt": "2024-01-01T00:00:00Z",
    "uploadedBy": "Property Manager"
  }
]
```

### GET /documents/:id
Get document by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single document object

### GET /documents/tenant/:tenantId
Get documents by tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of documents

### GET /documents/landlord/:landlordId
Get documents by landlord.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of documents

### GET /documents/property/:propertyId
Get documents by property.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of documents

### GET /documents/lease/:leaseId
Get documents by lease.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of documents

### POST /documents/upload
Upload a document.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file and metadata

**Response:**
```json
{
  "success": true,
  "document": { /* document object */ }
}
```

### GET /documents/:documentId/download
Download a document.

**Headers:** `Authorization: Bearer {token}`

**Response:** File download (blob)

### PUT /documents/:documentId
Update document metadata.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "Updated Name.pdf",
  "category": "insurance"
}
```

**Response:** Updated document object

### DELETE /documents/:documentId
Delete a document.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### POST /documents/:documentId/share
Share a document.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "shareWith": [1, 2, 3],  // user IDs
  "permissions": "view"  // or "edit"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /documents/categories
Get document categories.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  "lease",
  "inspection",
  "insurance",
  "utilities",
  "personal",
  "other"
]
```

### GET /tenant/documents
Get documents for current tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of documents

### POST /tenant/documents
Upload document as tenant.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file and category

**Response:** Created document object

### DELETE /tenant/documents/:id
Delete tenant document.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

---

## Notifications

### GET /notifications
Get all notifications.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "title": "Rent Payment Due",
    "message": "Your rent payment is due in 3 days",
    "type": "payment",
    "read": false,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### GET /notifications/:id
Get notification by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single notification object

### GET /notifications/user/:userId
Get notifications for user.

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of notifications

### GET /notifications/user/:userId/unread-count
Get unread notification count.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "count": 5
}
```

### PUT /notifications/:notificationId/read
Mark notification as read.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### PUT /notifications/user/:userId/read-all
Mark all notifications as read.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### DELETE /notifications/:notificationId
Delete a notification.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### DELETE /notifications/user/:userId/all
Delete all notifications for user.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /notifications/user/:userId/preferences
Get notification preferences.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "email": true,
  "sms": false,
  "push": true,
  "categories": {
    "payments": true,
    "maintenance": true,
    "messages": true
  }
}
```

### PUT /notifications/user/:userId/preferences
Update notification preferences.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "email": true,
  "sms": true,
  "push": true
}
```

**Response:** Updated preferences

### POST /notifications/push-token
Register push notification token.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "userId": 1,
  "token": "expo_push_token_xyz"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /notifications/send
Send notification (admin/system).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "userId": 1,
  "title": "System Notification",
  "message": "Your payment was successful",
  "type": "payment"
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Messages

### GET /messages/conversations/:userId
Get conversations for user.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "participants": [1, 2],
    "lastMessage": "Hello, how are you?",
    "lastMessageAt": "2024-01-01T10:30:00Z",
    "unreadCount": 2
  }
]
```

### GET /messages/conversations/details/:conversationId
Get conversation details.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "participants": [
    {
      "id": 1,
      "name": "John Doe",
      "role": "tenant"
    },
    {
      "id": 2,
      "name": "Property Manager",
      "role": "manager"
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /messages/:conversationId
Get messages in conversation.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Messages per page (default: 50)

**Response:**
```json
[
  {
    "id": 1,
    "conversationId": 1,
    "senderId": 1,
    "message": "Hello, how are you?",
    "read": false,
    "createdAt": "2024-01-01T10:30:00Z"
  }
]
```

### POST /messages/send
Send a message.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "conversationId": 1,
  "message": "Hello, how are you?",
  "recipientId": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": { /* message object */ }
}
```

### PUT /messages/:conversationId/read
Mark messages as read.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "userId": 1
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /messages/unread-count/:userId
Get unread message count.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "count": 5
}
```

### POST /messages/conversations
Create a new conversation.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "participantIds": [1, 2]
}
```

**Response:**
```json
{
  "success": true,
  "conversation": { /* conversation object */ }
}
```

### POST /messages/attachments
Upload message attachment.

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Request Body:** FormData with file

**Response:**
```json
{
  "success": true,
  "attachmentUrl": "/uploads/attachment1.jpg"
}
```

### DELETE /messages/:messageId
Delete a message.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /messages/:conversationId/search
Search messages in conversation.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `q`: Search query

**Response:** Array of matching messages

### GET /tenant/messages
Get messages for current tenant.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "from": "Property Manager",
    "to": "tenant@example.com",
    "subject": "Rent Payment Confirmation",
    "message": "Thank you for your payment",
    "timestamp": "2024-01-01T10:30:00Z",
    "read": true
  }
]
```

### POST /tenant/messages
Send message as tenant.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "to": "manager@example.com",
  "toName": "Property Manager",
  "subject": "Maintenance Request",
  "message": "I need help with...",
  "priority": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "message": { /* message object */ }
}
```

### PUT /tenant/messages/:id/read
Mark tenant message as read.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

---

## Analytics

### GET /analytics/dashboard/:landlordId
Get dashboard analytics for landlord.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalProperties": 10,
  "totalTenants": 50,
  "totalIncome": 2500000,
  "occupancyRate": 85,
  "pendingPayments": 250000,
  "maintenanceRequests": 5
}
```

### GET /analytics/financial/:landlordId
Get financial summary.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `period`: month, quarter, year

**Response:**
```json
{
  "totalIncome": 2500000,
  "totalExpenses": 500000,
  "netIncome": 2000000,
  "incomeByMonth": [
    { "month": "January", "amount": 250000 },
    { "month": "February", "amount": 250000 }
  ]
}
```

### GET /analytics/income/:landlordId
Get income report.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `start`: Start date (YYYY-MM-DD)
- `end`: End date (YYYY-MM-DD)

**Response:**
```json
{
  "totalIncome": 2500000,
  "rentIncome": 2000000,
  "otherIncome": 500000,
  "breakdown": [
    { "date": "2024-01-01", "amount": 250000, "source": "rent" }
  ]
}
```

### GET /analytics/expenses/:landlordId
Get expense report.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `start`: Start date
- `end`: End date

**Response:**
```json
{
  "totalExpenses": 500000,
  "maintenanceExpenses": 300000,
  "utilitiesExpenses": 100000,
  "otherExpenses": 100000,
  "breakdown": [
    { "date": "2024-01-01", "amount": 50000, "category": "maintenance" }
  ]
}
```

### GET /analytics/property/:propertyId
Get property performance.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `period`: month, quarter, year

**Response:**
```json
{
  "propertyId": 1,
  "occupancyRate": 85,
  "totalIncome": 500000,
  "totalExpenses": 100000,
  "netIncome": 400000,
  "maintenanceRequests": 5
}
```

### GET /analytics/occupancy/:landlordId
Get occupancy report.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalUnits": 100,
  "occupiedUnits": 85,
  "vacantUnits": 15,
  "occupancyRate": 85,
  "byProperty": [
    {
      "propertyId": 1,
      "propertyName": "Sunset Apartments",
      "totalUnits": 10,
      "occupiedUnits": 8,
      "occupancyRate": 80
    }
  ]
}
```

### GET /analytics/tenants/:landlordId
Get tenant report.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalTenants": 50,
  "activeTenants": 45,
  "inactiveTenants": 5,
  "newTenants": 5,
  "leavingTenants": 2
}
```

### GET /analytics/payments/:landlordId
Get payment report.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `period`: month, quarter, year

**Response:**
```json
{
  "totalPayments": 2500000,
  "paidOnTime": 2000000,
  "latePay ments": 500000,
  "pendingPayments": 250000,
  "paymentMethods": {
    "mpesa": 1500000,
    "bank_transfer": 800000,
    "card": 200000
  }
}
```

### GET /analytics/maintenance/:landlordId
Get maintenance report.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `period`: month, quarter, year

**Response:**
```json
{
  "totalRequests": 50,
  "completed": 40,
  "pending": 10,
  "averageResolutionTime": "2 days",
  "byCategory": {
    "plumbing": 20,
    "electrical": 15,
    "other": 15
  }
}
```

### GET /analytics/export/:reportType/:landlordId
Export report.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `format`: pdf, csv, excel

**Response:** File download (blob)

---

## Vendors

### GET /vendors
Get all vendors.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
[
  {
    "id": 1,
    "name": "John's Plumbing",
    "serviceTypes": ["plumbing"],
    "phone": "+254722111222",
    "email": "john@plumbing.com",
    "rating": 4.5,
    "availability": "available"
  }
]
```

### GET /vendors/:id
Get vendor by ID.

**Headers:** `Authorization: Bearer {token}`

**Response:** Single vendor object

### GET /tenant/vendors
Get vendors for tenant.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `serviceTypes[]` (optional): Filter by service types
- `minRating` (optional): Minimum rating
- `availability` (optional): available, busy

**Response:** Array of vendors

### GET /tenant/vendors/:id
Get specific vendor details.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "name": "John's Plumbing",
  "serviceTypes": ["plumbing", "drainage"],
  "phone": "+254722111222",
  "email": "john@plumbing.com",
  "rating": 4.5,
  "availability": "available",
  "description": "Professional plumbing services",
  "yearsOfExperience": 10,
  "certifications": ["Licensed Plumber"],
  "reviews": [
    {
      "rating": 5,
      "comment": "Excellent service",
      "date": "2024-01-01"
    }
  ]
}
```

### POST /tenant/vendors/:vendorId/contact
Contact a vendor.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "message": "I need plumbing services"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Your message has been sent to the vendor"
}
```

### POST /tenant/vendors/:vendorId/request
Request service from vendor.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "serviceType": "plumbing",
  "description": "Leaking faucet repair",
  "preferredDate": "2024-01-05",
  "urgency": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": 123,
  "message": "Service request submitted successfully"
}
```

---

## Move-Out

### POST /tenant/move-out/request
Submit move-out request.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "propertyId": 1,
  "leaseId": 1,
  "moveOutDate": "2024-12-31",
  "reason": "Relocating to another city",
  "forwardingAddress": "456 New St, Mombasa"
}
```

**Response:**
```json
{
  "success": true,
  "referenceNumber": "MO-12345678",
  "moveOutRequest": {
    "id": 1,
    "referenceNumber": "MO-12345678",
    "propertyId": 1,
    "leaseId": 1,
    "moveOutDate": "2024-12-31",
    "reason": "Relocating to another city",
    "status": "pending",
    "submittedAt": "2024-01-01T00:00:00Z",
    "stakeholderNotified": true
  }
}
```

### GET /tenant/move-out/status/:requestId
Get move-out request status.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "referenceNumber": "MO-12345678",
  "status": "approved",
  "moveOutDate": "2024-12-31",
  "submittedAt": "2024-01-01T00:00:00Z",
  "approvedAt": "2024-01-02T00:00:00Z",
  "statusHistory": [
    {
      "status": "pending",
      "timestamp": "2024-01-01T00:00:00Z",
      "note": "Move-out request submitted"
    },
    {
      "status": "approved",
      "timestamp": "2024-01-02T00:00:00Z",
      "note": "Move-out request approved"
    }
  ],
  "inspectionScheduled": {
    "date": "2024-12-30",
    "time": "10:00 AM"
  }
}
```

### GET /tenant/move-out/current
Get current move-out request.

**Headers:** `Authorization: Bearer {token}`

**Response:** Move-out request object or null

### DELETE /tenant/move-out/request/:requestId
Cancel move-out request.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "message": "Move-out request cancelled"
}
```

---

## Deposit Refund

### POST /tenant/deposit/refund
Request deposit refund.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "moveOutRequestId": 1,
  "depositAmount": 50000,
  "bankDetails": {
    "accountNumber": "1234567890",
    "bankName": "KCB Bank",
    "accountName": "John Doe"
  }
}
```

**Response:**
```json
{
  "success": true,
  "refundRequest": {
    "id": 1,
    "moveOutRequestId": 1,
    "depositAmount": 50000,
    "status": "submitted",
    "submittedAt": "2024-01-01T00:00:00Z",
    "stages": [
      { "stage": "submitted", "completed": true, "timestamp": "2024-01-01T00:00:00Z" },
      { "stage": "inspection", "completed": false, "timestamp": null },
      { "stage": "approved", "completed": false, "timestamp": null },
      { "stage": "paid", "completed": false, "timestamp": null }
    ]
  }
}
```

### GET /tenant/deposit/status/:refundId
Get deposit refund status.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": 1,
  "moveOutRequestId": 1,
  "depositAmount": 50000,
  "status": "approved",
  "submittedAt": "2024-01-01T00:00:00Z",
  "stages": [
    { "stage": "submitted", "completed": true, "timestamp": "2024-01-01T00:00:00Z" },
    { "stage": "inspection", "completed": true, "timestamp": "2024-01-02T00:00:00Z" },
    { "stage": "approved", "completed": true, "timestamp": "2024-01-03T00:00:00Z" },
    { "stage": "paid", "completed": false, "timestamp": null }
  ],
  "statusHistory": [
    {
      "status": "submitted",
      "timestamp": "2024-01-01T00:00:00Z",
      "note": "Refund request submitted"
    },
    {
      "status": "inspection",
      "timestamp": "2024-01-02T00:00:00Z",
      "note": "Property inspection scheduled"
    },
    {
      "status": "approved",
      "timestamp": "2024-01-03T00:00:00Z",
      "note": "Refund approved"
    }
  ],
  "deductions": [
    {
      "description": "Carpet cleaning",
      "amount": 5000
    }
  ],
  "refundAmount": 45000,
  "paymentDetails": null
}
```

### GET /tenant/deposit/current
Get current deposit refund request.

**Headers:** `Authorization: Bearer {token}`

**Response:** Deposit refund object or null

### PUT /tenant/deposit/refund/:refundId/status
Update deposit refund status (admin/manager).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "status": "approved",
  "deductions": [
    {
      "description": "Carpet cleaning",
      "amount": 5000
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "refund": { /* updated refund object */ }
}
```

---

## Admin

### GET /admin/users
Get all users (admin only).

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `role` (optional): Filter by role
- `status` (optional): active, inactive
- `page` (optional)
- `limit` (optional)

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "tenant",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### GET /admin/users/:id
Get user by ID (admin only).

**Headers:** `Authorization: Bearer {token}`

**Response:** Single user object with detailed information

### PUT /admin/users/:id
Update user (admin only).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "role": "landlord",
  "status": "active"
}
```

**Response:** Updated user object

### DELETE /admin/users/:id
Delete user (admin only).

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true
}
```

### GET /admin/system/stats
Get system statistics (admin only).

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "totalUsers": 1000,
  "totalProperties": 500,
  "totalTenants": 800,
  "totalPayments": 50000000,
  "activeLeases": 750,
  "maintenanceRequests": 100
}
```

### GET /admin/audit-logs
Get audit logs (admin only).

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `userId` (optional)
- `action` (optional): login, logout, create, update, delete
- `startDate` (optional)
- `endDate` (optional)
- `page` (optional)
- `limit` (optional)

**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "action": "login",
    "resource": "auth",
    "details": "User logged in successfully",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T10:30:00Z"
  }
]
```

### GET /admin/settings
Get system settings (admin only).

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "maintenanceMode": false,
  "allowSignups": true,
  "defaultCurrency": "KES",
  "paymentMethods": ["mpesa", "card", "bank_transfer"],
  "emailNotifications": true,
  "smsNotifications": true
}
```

### PUT /admin/settings
Update system settings (admin only).

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "maintenanceMode": false,
  "allowSignups": true
}
```

**Response:** Updated settings object

---

## WebSocket Events

The backend should emit the following WebSocket events for real-time updates:

### Connection
```javascript
// Client connects with authentication
socket.on('connect', () => {
  socket.emit('authenticate', { token: 'jwt_token' });
});
```

### Events to Emit from Backend

#### notification
Emit when a new notification is created.
```json
{
  "id": 1,
  "userId": 1,
  "title": "Rent Payment Due",
  "message": "Your rent payment is due in 3 days",
  "type": "payment",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### message
Emit when a new message is received.
```json
{
  "id": 1,
  "conversationId": 1,
  "senderId": 2,
  "message": "Hello, how are you?",
  "createdAt": "2024-01-01T10:30:00Z"
}
```

#### payment_update
Emit when payment status changes.
```json
{
  "id": 1,
  "tenantId": 1,
  "amount": 50000,
  "status": "paid",
  "transactionId": "MPE123456"
}
```

#### maintenance_update
Emit when maintenance request is updated.
```json
{
  "id": 1,
  "ticketNumber": "TKT-12345678-001",
  "status": "assigned",
  "assignedVendor": "John's Plumbing"
}
```

#### property_update
Emit when property information changes.
```json
{
  "id": 1,
  "name": "Sunset Apartments",
  "action": "updated"
}
```

#### lease_update
Emit when lease information changes.
```json
{
  "id": 1,
  "tenantId": 1,
  "status": "renewed",
  "endDate": "2026-01-01"
}
```

#### tenant_update
Emit when tenant information changes.
```json
{
  "id": 1,
  "action": "updated",
  "changes": ["phone", "email"]
}
```

#### document_update
Emit when document is added or updated.
```json
{
  "id": 1,
  "name": "Lease Agreement.pdf",
  "action": "uploaded",
  "uploadedBy": "Property Manager"
}
```

### Room Management

Clients can join rooms for targeted updates:

```javascript
// Join property-specific room
socket.emit('join_room', { roomId: 'property_1' });

// Join role-specific room
socket.emit('join_room', { roomId: 'landlord_1' });

// Leave room
socket.emit('leave_room', { roomId: 'property_1' });
```

---

## Error Responses

All endpoints should return consistent error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Invalid input data",
  "details": {
    "field": "email",
    "issue": "Invalid email format"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "You don't have permission to access this resource"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Authentication & Authorization

### JWT Token Structure
```json
{
  "userId": 1,
  "email": "user@example.com",
  "role": "tenant",
  "iat": 1609459200,
  "exp": 1609462800
}
```

### Role-Based Access Control

**Roles:**
- `tenant` - Can access tenant-specific endpoints
- `landlord` - Can manage properties and tenants
- `agent` - Can list and manage properties
- `manager` - Can manage properties on behalf of landlords
- `vendor` - Can view and respond to maintenance requests
- `admin` - Full system access

**Protected Routes:**
- All routes require authentication except `/auth/login` and `/auth/signup`
- Admin routes (`/admin/*`) require `admin` role
- Landlord routes require `landlord` or `manager` role
- Tenant routes (`/tenant/*`) require `tenant` role

---

## Rate Limiting

Implement rate limiting on all endpoints:

- **Authentication endpoints**: 5 requests per minute
- **General API endpoints**: 100 requests per minute
- **File upload endpoints**: 10 requests per minute

---

## CORS Configuration

Allow requests from:
- `http://localhost:3000` (development - web)
- `http://localhost:19006` (development - mobile)
- `https://nyumbasync.com` (production - web)
- Mobile app (React Native)

---

## File Upload Specifications

### Supported File Types
- **Images**: jpg, jpeg, png, gif (max 5MB)
- **Documents**: pdf, doc, docx (max 10MB)

### Upload Endpoints
- Property images: `/properties/:propertyId/images`
- Maintenance photos: `/maintenance/:id/photos`
- Lease documents: `/leases/:leaseId/documents`
- General documents: `/documents/upload` or `/tenant/documents`
- Message attachments: `/messages/attachments`

---

## Pagination

All list endpoints support pagination:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response Format:**
```json
{
  "data": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

## Testing the API

### Using cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user@example.com","password":"password123"}'

# Get properties (with token)
curl -X GET http://localhost:3001/api/properties \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman

1. Import the API collection
2. Set environment variables:
   - `base_url`: `http://localhost:3001/api`
   - `token`: Your JWT token
3. Test each endpoint

---

## Implementation Checklist

- [ ] Set up Express.js server
- [ ] Configure database (PostgreSQL/MongoDB)
- [ ] Implement JWT authentication
- [ ] Create user model and authentication routes
- [ ] Implement property management routes
- [ ] Implement tenant management routes
- [ ] Implement payment processing (M-Pesa integration)
- [ ] Implement maintenance request routes
- [ ] Implement lease management routes
- [ ] Implement document management routes
- [ ] Implement notification system
- [ ] Implement messaging system
- [ ] Implement analytics routes
- [ ] Implement vendor management routes
- [ ] Implement move-out and deposit refund routes
- [ ] Implement admin routes
- [ ] Set up WebSocket server (Socket.IO)
- [ ] Implement real-time event emissions
- [ ] Add rate limiting
- [ ] Add CORS configuration
- [ ] Add error handling middleware
- [ ] Add request validation
- [ ] Add logging
- [ ] Write API tests
- [ ] Deploy to production

---

## Support & Documentation

For questions or issues with the API:
1. Check this documentation
2. Review the frontend code for usage examples
3. Test endpoints using Postman or cURL
4. Check server logs for errors

---

**Last Updated**: November 19, 2025  
**API Version**: 1.0.0  
**Frontend Compatibility**: Web, Mobile, Desktop
