# Tenant Portal Migration Guide

## Overview

This guide helps you migrate existing tenant data to the new tenant portal system and set up the infrastructure for tenant registration.

## Database Migration

### Step 1: Update Existing Contact Records

If you have existing tenant contacts, you need to add the `tenantPortal` structure to them.

```javascript
// Migration script: nyumbasync_backend/scripts/migrate-tenant-portal.js

const mongoose = require('mongoose');
const { Contact } = require('../models');

async function migrateTenantContacts() {
  try {
    // Find all contacts with tenant role
    const tenantContacts = await Contact.find({
      $or: [
        { primaryRole: 'tenant' },
        { roles: 'tenant' }
      ]
    });

    console.log(`Found ${tenantContacts.length} tenant contacts to migrate`);

    for (const contact of tenantContacts) {
      // Initialize tenantPortal object if it doesn't exist
      if (!contact.tenantPortal) {
        contact.tenantPortal = {
          hasPortalAccess: false,
          emailVerified: false,
          phoneVerified: false,
          linkedLeases: [],
          occupants: [],
          vehicles: []
        };

        // If contact has email, they can potentially access portal
        if (contact.email) {
          contact.tenantPortal.hasPortalAccess = true;
          // Add tenant-portal tag
          if (!contact.tags.includes('tenant-portal')) {
            contact.tags.push('tenant-portal');
          }
        }

        await contact.save();
        console.log(`Migrated contact: ${contact.fullName}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run migration
migrateTenantContacts();
```

### Step 2: Link Existing Leases

If you have existing lease transactions, link them to tenant contacts.

```javascript
// Migration script: nyumbasync_backend/scripts/link-existing-leases.js

const mongoose = require('mongoose');
const { Contact, Transaction } = require('../models');

async function linkExistingLeases() {
  try {
    // Find all lease transactions
    const leases = await Transaction.find({
      dealType: 'lease',
      'pipeline.stage': { $in: ['under_contract', 'closed'] }
    }).populate('contacts.contact');

    console.log(`Found ${leases.length} lease transactions`);

    for (const lease of leases) {
      // Generate verification code if not exists
      if (!lease.tenantPortal?.verificationCode) {
        await lease.generateVerificationCode();
        console.log(`Generated code for lease ${lease._id}: ${lease.tenantPortal.verificationCode}`);
      }

      // Find tenant contact in the transaction
      const tenantContactRef = lease.contacts.find(c => c.role === 'tenant');
      
      if (tenantContactRef) {
        const contact = await Contact.findById(tenantContactRef.contact);
        
        if (contact && contact.tenantPortal?.hasPortalAccess) {
          // Check if lease is already linked
          const alreadyLinked = contact.tenantPortal.linkedLeases?.some(
            ll => ll.transaction.toString() === lease._id.toString()
          );

          if (!alreadyLinked) {
            // Link the lease
            await contact.linkLease(
              lease._id,
              lease.property,
              lease.tenantPortal.verificationCode
            );
            
            // Update transaction
            await lease.linkTenantContact(contact._id);
            
            console.log(`Linked lease ${lease._id} to contact ${contact.fullName}`);
          }
        }
      }
    }

    console.log('Lease linking completed successfully');
  } catch (error) {
    console.error('Lease linking error:', error);
  }
}

// Run migration
linkExistingLeases();
```

### Step 3: Create Authentication Records

Create TenantPortalAuth records for existing tenant portal users.

```javascript
// Migration script: nyumbasync_backend/scripts/create-auth-records.js

const mongoose = require('mongoose');
const { Contact } = require('../models');
const TenantPortalAuth = require('../models/tenant-portal-auth.model');

async function createAuthRecords() {
  try {
    // Find all contacts with portal access
    const portalContacts = await Contact.find({
      'tenantPortal.hasPortalAccess': true,
      email: { $exists: true, $ne: null }
    });

    console.log(`Found ${portalContacts.length} contacts with portal access`);

    for (const contact of portalContacts) {
      // Check if auth record already exists
      const existingAuth = await TenantPortalAuth.findOne({
        contact: contact._id
      });

      if (!existingAuth) {
        // Create new auth record
        const auth = await TenantPortalAuth.create({
          contact: contact._id,
          email: contact.email,
          isActive: true,
          termsVersion: '1.0',
          termsAcceptedAt: new Date(),
          privacyPolicyVersion: '1.0',
          privacyPolicyAcceptedAt: new Date()
        });

        console.log(`Created auth record for ${contact.email}`);
      }
    }

    console.log('Auth record creation completed successfully');
  } catch (error) {
    console.error('Auth record creation error:', error);
  }
}

// Run migration
createAuthRecords();
```

## Running Migrations

### Option 1: Run Individual Scripts

```bash
# Navi
gate to backend directory
cd nyumbasync_backend

# Run migrations in order
node scripts/migrate-tenant-portal.js
node scripts/link-existing-leases.js
node scripts/create-auth-records.js
```

### Option 2: Combined Migration Script

Create a master migration script:

```javascript
// nyumbasync_backend/scripts/run-all-migrations.js

const mongoose = require('mongoose');
require('dotenv').config();

// Import migration functions
const migrateTenantContacts = require('./migrate-tenant-portal');
const linkExistingLeases = require('./link-existing-leases');
const createAuthRecords = require('./create-auth-records');

async function runAllMigrations() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Run migrations in sequence
    console.log('\n=== Step 1: Migrating Tenant Contacts ===');
    await migrateTenantContacts();

    console.log('\n=== Step 2: Linking Existing Leases ===');
    await linkExistingLeases();

    console.log('\n=== Step 3: Creating Auth Records ===');
    await createAuthRecords();

    console.log('\n=== All Migrations Completed Successfully ===');
    
    // Disconnect
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runAllMigrations();
```

Run with:
```bash
node scripts/run-all-migrations.js
```

## Post-Migration Tasks

### 1. Verify Data Integrity

```javascript
// Verification script
const { Contact, Transaction } = require('../models');
const TenantPortalAuth = require('../models/tenant-portal-auth.model');

async function verifyMigration() {
  // Check contacts
  const contactsWithPortal = await Contact.countDocuments({
    'tenantPortal.hasPortalAccess': true
  });
  console.log(`Contacts with portal access: ${contactsWithPortal}`);

  // Check linked leases
  const contactsWithLeases = await Contact.countDocuments({
    'tenantPortal.linkedLeases.0': { $exists: true }
  });
  console.log(`Contacts with linked leases: ${contactsWithLeases}`);

  // Check auth records
  const authRecords = await TenantPortalAuth.countDocuments();
  console.log(`Auth records created: ${authRecords}`);

  // Check verification codes
  const leasesWithCodes = await Transaction.countDocuments({
    dealType: 'lease',
    'tenantPortal.verificationCode': { $exists: true }
  });
  console.log(`Leases with verification codes: ${leasesWithCodes}`);
}
```

### 2. Send Invitation Emails

After migration, send invitation emails to all tenants:

```javascript
// Send invitations to migrated tenants
const { Contact, Transaction } = require('../models');

async function sendMigrationInvitations() {
  const contacts = await Contact.find({
    'tenantPortal.hasPortalAccess': true,
    'tenantPortal.linkedLeases.0': { $exists: true }
  }).populate('tenantPortal.linkedLeases.transaction');

  for (const contact of contacts) {
    const lease = contact.tenantPortal.linkedLeases[0].transaction;
    
    if (lease && lease.tenantPortal?.verificationCode) {
      // TODO: Send invitation email
      console.log(`Send invitation to ${contact.email}`);
      console.log(`Verification code: ${lease.tenantPortal.verificationCode}`);
    }
  }
}
```

### 3. Update Existing Flows

If you have existing flows that interact with tenants, update them to use the new tenant portal fields:

```javascript
// Example: Update tenant notification flow
{
  name: 'tenant-rent-reminder',
  trigger: {
    model: 'Transaction',
    event: 'created',
    condition: (transaction) => {
      return transaction.type === 'rent' && 
             transaction.status === 'pending';
    }
  },
  actions: [
    {
      type: 'email',
      to: '{{contact.email}}',
      template: 'rent-reminder',
      condition: (context) => {
        // Only send if tenant has portal access
        return context.contact.tenantPortal?.hasPortalAccess;
      }
    },
    {
      type: 'sms',
      to: '{{contact.phone}}',
      template: 'rent-reminder-sms',
      condition: (context) => {
        // Send SMS if preferred communication method
        return context.contact.tenantPortal?.preferredCommunicationMethod === 'sms';
      }
    }
  ]
}
```

## Rollback Plan

If you need to rollback the migration:

```javascript
// Rollback script
async function rollbackMigration() {
  try {
    // Remove tenantPortal fields from contacts
    await Contact.updateMany(
      {},
      { $unset: { tenantPortal: "" } }
    );

    // Remove tenantPortal fields from transactions
    await Transaction.updateMany(
      {},
      { $unset: { tenantPortal: "" } }
    );

    // Delete all TenantPortalAuth records
    await TenantPortalAuth.deleteMany({});

    // Remove tenant-portal tags
    await Contact.updateMany(
      { tags: 'tenant-portal' },
      { $pull: { tags: 'tenant-portal' } }
    );

    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback error:', error);
  }
}
```

## Testing After Migration

### 1. Test Registration Flow

```bash
# Test new tenant registration
curl -X POST http://localhost:5000/api/tenant-portal/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newtenanttest@example.com",
    "firstName": "Test",
    "lastName": "Tenant",
    "phone": "+254712345678",
    "agreeToTerms": true,
    "agreeToPrivacy": true
  }'
```

### 2. Test Existing Tenant Login

```bash
# Test login for migrated tenant
curl -X POST http://localhost:5000/api/tenant-portal/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existingtenant@example.com"
  }'
```

### 3. Test Verification Code

```bash
# Test verification code lookup
curl -X GET http://localhost:5000/api/v2/transactions/by-verification-code/A7B9C2D4
```

### 4. Test Profile Access

```bash
# Test profile retrieval (after authentication)
curl -X GET http://localhost:5000/api/tenant-portal/profile \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Common Migration Issues

### Issue 1: Duplicate Email Addresses

**Problem:** Multiple contacts with same email
**Solution:**
```javascript
// Find and merge duplicate contacts
const duplicates = await Contact.aggregate([
  { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { count: { $gt: 1 } } }
]);

// Manually review and merge
```

### Issue 2: Missing Transaction Links

**Problem:** Tenants without linked transactions
**Solution:**
```javascript
// Find tenants without leases
const tenantsWithoutLeases = await Contact.find({
  primaryRole: 'tenant',
  'tenantPortal.linkedLeases': { $size: 0 }
});

// Manually link or create transactions
```

### Issue 3: Invalid Phone Numbers

**Problem:** Phone numbers in wrong format
**Solution:**
```javascript
// Normalize phone numbers
await Contact.updateMany(
  { phone: { $regex: '^07' } },
  [{ $set: { phone: { $concat: ['254', { $substr: ['$phone', 1, -1] }] } } }]
);
```

## Monitoring After Migration

### Key Metrics to Track

1. **Registration Success Rate**
   - Track successful registrations
   - Monitor verification email delivery
   - Track email verification rate

2. **Lease Linking Rate**
   - Monitor verification code usage
   - Track successful lease links
   - Identify expired codes

3. **Profile Completion Rate**
   - Track profile completion percentage
   - Monitor time to completion
   - Identify incomplete profiles

4. **Authentication Issues**
   - Track failed login attempts
   - Monitor account lockouts
   - Track session expiration

### Monitoring Queries

```javascript
// Dashboard queries
const metrics = {
  totalTenantPortalUsers: await Contact.countDocuments({
    'tenantPortal.hasPortalAccess': true
  }),
  
  verifiedEmails: await Contact.countDocuments({
    'tenantPortal.emailVerified': true
  }),
  
  linkedLeases: await Contact.countDocuments({
    'tenantPortal.linkedLeases.0': { $exists: true }
  }),
  
  completedProfiles: await Contact.countDocuments({
    'tenantPortal.profileCompletedAt': { $exists: true }
  }),
  
  activeVerificationCodes: await Transaction.countDocuments({
    'tenantPortal.verificationCode': { $exists: true },
    'tenantPortal.codeExpiresAt': { $gt: new Date() }
  })
};
```

## Best Practices

1. **Backup Before Migration**
   ```bash
   mongodump --uri="mongodb://localhost:27017/nyumbasync" --out=backup-$(date +%Y%m%d)
   ```

2. **Test on Staging First**
   - Run migration on staging environment
   - Verify all functionality
   - Test rollback procedure

3. **Gradual Rollout**
   - Migrate in batches
   - Monitor each batch
   - Address issues before next batch

4. **Communication Plan**
   - Notify tenants about new portal
   - Provide clear instructions
   - Offer support during transition

5. **Documentation**
   - Document any custom changes
   - Keep migration logs
   - Update runbooks

## Support During Migration

### For Developers
- Review TENANT_PORTAL_IMPLEMENTATION.md
- Check API documentation
- Test all endpoints

### For Administrators
- Review TENANT_PORTAL_QUICK_START.md
- Understand verification code system
- Know how to generate codes

### For Support Team
- Understand registration flow
- Know common issues
- Have troubleshooting guide

## Conclusion

This migration guide provides a comprehensive approach to:
1. Migrating existing tenant data
2. Setting up authentication records
3. Linking existing leases
4. Verifying data integrity
5. Monitoring post-migration

Follow the steps in order and test thoroughly at each stage. Keep backups and have a rollback plan ready.
