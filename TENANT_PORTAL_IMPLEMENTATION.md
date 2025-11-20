# Tenant Portal Implementation Guide

## Overview

The Tenant Portal is a secure, phased registration system that allows tenants to access their lease information, make payments, submit maintenance requests, and communicate with landlords through the Nyumbasync platform.

## Architecture

### Three-Phase Registration Process

#### Phase 1: Initial Portal Registration & Profile Creation
Minimum required for a Contact to be created with tenant-portal access.

**Required Fields:**
- Email Address (serves as username)
- Full Legal Name (First Name + Last Name)
- Phone Number (for SMS verification and communications)
- Agreement to Terms of Service
- Agreement to Privacy Policy
- Consent to Electronic Communications

**Process:**
1. User submits registration form
2. System creates/updates Contact record with `tenant-portal` tag
3. Email verification link sent (magic link)
4. User clicks link to verify email
5. Portal access granted

#### Phase 2: Linking to Property & Lease
After registration, tenant must link to a specific property and lease.

**Methods:**
1. **Verification Code Method:**
   - Landlord generates unique code in Nyumbasync for each lease
   - Code given to tenant in welcome packet
   - Tenant enters code in portal
   - System validates and links lease to contact

2. **Automated Invitation Method:**
   - Landlord changes Contact status to 'tenant' in Nyumbasync
   - Flow automatically sends invitation email with unique link
   - Tenant clicks link to register/link lease

**Prerequisites:**
- Active Transaction record of type 'lease'
- Transaction in 'under_contract' or 'closed' stage
- Valid verification code (expires in 30 days)

#### Phase 3: Complete Tenant Profile
After lease linkage, tenant completes full profile.

**Required Information:**
- Emergency Contact (Name, Relationship, Phone, Address)
- Occupant Information (Names, DOB for all occupants)
- Vehicle Information (Make, Model, Color, License Plate)
- Preferred Communication Method (Portal, Email, SMS, Phone)

## Database Models

### Contact Model Extensions

```javascript
tenantPortal: {
  // Phase 1: Registration
  hasPortalAccess: Boolean,
  emailVerified: Boolean,
  emailVerificationToken: String,
  emailVerificationExpiry: Date,
  phoneVerified: Boolean,
  termsAcceptedAt: Date,
  privacyPolicyAcceptedAt: Date,
  
  // Phase 2: Lease Linkage
  linkedLeases: [{
    transaction: ObjectId (ref: Transaction),
    property: ObjectId (ref: Property),
    verificationCode: String,
    linkedAt: Date,
    status: String (pending/active/expired/terminated)
  }],
  
  // Phase 3: Profile Completion
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String,
    address: Object
  },
  occupants: [{
    fullName: String,
    dateOfBirth: Date,
    relationship: String
  }],
  vehicles: [{
    make: String,
    model: String,
    color: String,
    licensePlate: String,
    parkingPassNumber: String
  }],
  preferredCommunicationMethod: String,
  profileCompletedAt: Date,
  lastLoginAt: Date
}
```

### Transaction Model Extensions

```javascript
tenantPortal: {
  verificationCode: String (unique, 8-char alphanumeric),
  codeGeneratedAt: Date,
  codeExpiresAt: Date (30 days from generation),
  invitationSentAt: Date,
  invitationEmail: String,
  tenantLinkedAt: Date,
  tenantContact: ObjectId (ref: Contact)
}
```

### TenantPortalAuth Model

Handles passwordless authentication using magic links.

```javascript
{
  contact: ObjectId (ref: Contact),
  email: String (unique),
  magicLinkToken: String (hashed),
  magicLinkExpiry: Date (15 minutes),
  activeSessions: [{
    token: String (hashed),
    deviceInfo: String,
    ipAddress: String,
    createdAt: Date,
    expiresAt: Date (30 days),
    lastActivityAt: Date
  }],
  failedLoginAttempts: Number,
  accountLockedUntil: Date,
  lastLoginAt: Date,
  termsVersion: String,
  termsAcceptedAt: Date
}
```

## API Endpoints

### Public Endpoints (No Authentication)

#### Register Tenant
```
POST /api/tenant-portal/register
Body: {
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  agreeToTerms: boolean,
  agreeToPrivacy: boolean
}
```

#### Verify Email
```
GET /api/tenant-portal/verify-email/:token
```

#### Request Login Link
```
POST /api/tenant-portal/login
Body: {
  email: string
}
```

#### Authenticate with Magic Link
```
POST /api/tenant-portal/authenticate/:token
Body: {
  deviceInfo: string (optional)
}
```

### Protected Endpoints (Require Authentication)

#### Link Lease
```
POST /api/tenant-portal/link-lease
Headers: Authorization: Bearer {sessionToken}
Body: {
  verificationCode: string
}
```

#### Complete Profile
```
POST /api/tenant-portal/complete-profile
Headers: Authorization: Bearer {sessionToken}
Body: {
  emergencyContact: {
    name: string,
    relationship: string,
    phone: string,
    address: object
  },
  occupants: array,
  vehicles: array,
  preferredCommunicationMethod: string
}
```

#### Get Profile
```
GET /api/tenant-portal/profile
Headers: Authorization: Bearer {sessionToken}
```

#### Update Profile
```
PUT /api/tenant-portal/profile
Headers: Authorization: Bearer {sessionToken}
Body: {
  phone: string (optional),
  emergencyContact: object (optional),
  occupants: array (optional),
  vehicles: array (optional),
  preferredCommunicationMethod: string (optional)
}
```

#### Logout
```
POST /api/tenant-portal/logout
Headers: Authorization: Bearer {sessionToken}
```

### Landlord Endpoints

#### Generate Verification Code
```
POST /api/v2/transactions/:transactionId/generate-verification-code
```

#### Send Tenant Invitation
```
POST /api/v2/transactions/:transactionId/send-tenant-invitation
Body: {
  email: string
}
```

#### Get Lease by Verification Code
```
GET /api/v2/transactions/by-verification-code/:code
```

## Authentication Flow

### Magic Link Authentication

1. **Request Login:**
   - User enters email
   - System generates magic link token (32-byte random hex)
   - Token hashed with SHA-256 and stored
   - Email sent with unhashed token in link
   - Token expires in 15 minutes

2. **Authenticate:**
   - User clicks magic link
   - System validates token
   - Creates session token (32-byte random hex)
   - Session token hashed and stored
   - Returns unhashed session token to client
   - Session expires in 30 days

3. **Session Management:**
   - Client includes session token in Authorization header
   - System validates token on each request
   - Updates lastActivityAt on valid requests
   - Maximum 5 active sessions per user

### Security Features

- **Account Locking:** 5 failed login attempts locks account for 30 minutes
- **Token Expiry:** Magic links expire in 15 minutes
- **Session Expiry:** Sessions expire in 30 days
- **Hashed Tokens:** All tokens stored as SHA-256 hashes
- **Rate Limiting:** Should be implemented at API gateway level

## Middleware

### authenticateTenant
Validates session token and attaches contact to request.

### requireEmailVerification
Ensures email is verified before allowing access.

### requireLinkedLease
Ensures tenant has at least one active linked lease.

### requireCompletedProfile
Ensures tenant has completed their profile.

## Contact Model Methods

### Instance Methods
- `enablePortalAccess(email, phone)` - Enable portal access for contact
- `verifyEmail()` - Mark email as verified
- `verifyPhone()` - Mark phone as verified
- `linkLease(transactionId, propertyId, code)` - Link lease to contact
- `completePortalProfile(profileData)` - Complete tenant profile
- `updateLastLogin()` - Update last login timestamp

### Static Methods
- `findByEmail(email)` - Find contact by email
- `findByVerificationToken(token)` - Find by verification token
- `findTenantPortalUsers(filters)` - Get all tenant portal users

## Transaction Model Methods

### Instance Methods
- `generateVerificationCode()` - Generate 8-char verification code
- `sendTenantInvitation(email)` - Record invitation sent
- `linkTenantContact(contactId)` - Link tenant contact to lease

### Static Methods
- `findByVerificationCode(code)` - Find lease by verification code

## Integration with Flows Engine

### Automated Tenant Invitation Flow

```javascript
{
  name: 'tenant-invitation',
  trigger: {
    model: 'Contact',
    event: 'updated',
    condition: (contact) => {
      return contact.roles.includes('tenant') && 
             !contact.tenantPortal?.hasPortalAccess;
    }
  },
  actions: [
    {
      type: 'email',
      template: 'tenant-invitation',
      to: '{{contact.email}}',
      data: {
        verificationCode: '{{transaction.tenantPortal.verificationCode}}',
        propertyAddress: '{{property.address}}'
      }
    }
  ]
}
```

## Email Templates

### Verification Email
- Subject: "Verify your Nyumbasync Tenant Portal account"
- Contains magic link for email verification
- Link expires in 15 minutes

### Login Email
- Subject: "Your Nyumbasync Tenant Portal login link"
- Contains magic link for authentication
- Link expires in 15 minutes

### Tenant Invitation Email
- Subject: "Welcome to your new home - Tenant Portal Access"
- Contains verification code and registration link
- Code expires in 30 days

## Frontend Integration

### Registration Flow
1. Show registration form
2. Submit to `/api/tenant-portal/register`
3. Show "Check your email" message
4. User clicks verification link
5. Redirect to login page

### Login Flow
1. Show email input
2. Submit to `/api/tenant-portal/login`
3. Show "Check your email" message
4. User clicks magic link
5. Extract token from URL
6. Submit to `/api/tenant-portal/authenticate/:token`
7. Store session token in localStorage/cookie
8. Redirect to dashboard

### Lease Linking Flow
1. Show verification code input
2. Submit to `/api/tenant-portal/link-lease`
3. On success, redirect to profile completion

### Profile Completion Flow
1. Show profile form with all required fields
2. Submit to `/api/tenant-portal/complete-profile`
3. On success, redirect to dashboard

## Testing

### Test Scenarios

1. **Registration:**
   - Valid registration
   - Duplicate email
   - Missing required fields
   - Terms not accepted

2. **Email Verification:**
   - Valid token
   - Expired token
   - Invalid token

3. **Login:**
   - Valid email
   - Non-existent email
   - Account locked

4. **Lease Linking:**
   - Valid code
   - Expired code
   - Invalid code
   - Already linked

5. **Profile Completion:**
   - Valid data
   - Missing emergency contact
   - Invalid phone format

## Security Considerations

1. **Data Privacy:**
   - Only show tenant their own data
   - Encrypt sensitive information
   - Comply with data protection regulations

2. **Access Control:**
   - Validate session on every request
   - Implement proper authorization checks
   - Log all access attempts

3. **Rate Limiting:**
   - Limit login attempts
   - Limit verification code requests
   - Implement CAPTCHA for public endpoints

4. **Audit Trail:**
   - Log all authentication events
   - Track profile changes
   - Monitor suspicious activity

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Email service configured
- [ ] SMS service configured (optional)
- [ ] Database indexes created
- [ ] Rate limiting configured
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Email templates created
- [ ] Terms of Service published
- [ ] Privacy Policy published
- [ ] Monitoring and alerts configured
- [ ] Backup strategy implemented

## Future Enhancements

1. **Two-Factor Authentication:**
   - SMS verification
   - Authenticator app support

2. **Social Login:**
   - Google OAuth
   - Facebook OAuth

3. **Mobile App:**
   - Native iOS/Android apps
   - Push notifications

4. **Advanced Features:**
   - Document upload
   - Online rent payment
   - Maintenance request tracking
   - Communication portal
   - Lease renewal workflow

## Support

For issues or questions:
- Email: support@nyumbasync.com
- Phone: 0700NYUMBA
- Documentation: https://docs.nyumbasync.com
