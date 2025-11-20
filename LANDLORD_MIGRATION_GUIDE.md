# Landlord Portal Migration Guide

## Overview
This guide helps existing NyumbaSync users (landlords with properties in the system) migrate to the new comprehensive Landlord Portal with enhanced features.

## What's New?

### Enhanced Features
1. **Two-Factor Authentication** - Mandatory security for all landlord accounts
2. **Role-Based Access Control** - Create sub-accounts for staff and managers
3. **Workflow Automation** - Automate repetitive tasks
4. **Vendor Management** - Track and manage service providers
5. **Advanced Analytics** - Comprehensive financial dashboards
6. **Document Vault** - Secure document storage and management
7. **CRM Features** - Manage leads, prospects, and tenant lifecycle
8. **Service Agreement** - Digital agreement tracking

## Migration Steps

### Step 1: Account Upgrade (Automatic)

Your existing landlord account will be automatically upgraded with a LandlordProfile. No action needed.

**What happens:**
- A LandlordProfile is created linked to your User account
- Your existing properties are automatically linked
- Portfolio statistics are calculated
- Account type is set to `primary_landlord`

### Step 2: Enable Two-Factor Authentication (Required)

**Timeline:** Must be completed within 30 days of migration

**Steps:**
1. Login to your account
2. Navigate to Security Settings
3. Click "Setup 2FA"
4. Scan QR code with authenticator app
5. Save backup codes securely
6. Verify with 6-digit code

**API Endpoint:**
```
POST /landlord/2fa/setup
POST /landlord/2fa/verify
```

### Step 3: Accept Service Agreement (Required)

**Timeline:** Must be completed before accessing new features

**Steps:**
1. Review the Master Service Agreement
2. Provide digital signature
3. Accept terms

**API Endpoint:**
```
POST /landlord/service-agreement/accept
{
  "version": "1.0",
  "digitalSignature": "Your Name"
}
```

### Step 4: Upload Verification Documents (Recommended)

To unlock full features, upload property ownership documents:

**Required Documents:**
- Property tax bill
- Title deed
- Certificate of occupancy
- Insurance documents
- KRA PIN certificate
- ID document

**API Endpoint:**
```
POST /landlord/verification/documents
{
  "documentType": "title_deed",
  "url": "document_url"
}
```

**Verification Levels:**
- **Unverified**: Limited access (view only)
- **Pending**: Documents submitted, under review
- **Verified**: Full access to all features
- **Rejected**: Resubmission required

### Step 5: Migrate Existing Data

#### Properties
Your existing properties are automatically migrated. Review and update:
- Property images
- Amenities list
- Verification documents
- Investment data

#### Tenants
Existing tenant data is preserved. Consider:
- Converting to Contact records for CRM
- Adding communication history
- Updating contact stages

#### Transactions
All transaction history is maintained. New features:
- Categorization
- Expense tracking
- Financial reports

#### Maintenance Requests
Existing requests are preserved. New features:
- Vendor assignment
- Performance tracking
- Automated workflows

### Step 6: Set Up Workflows (Optional but Recommended)

Create automated workflows for common tasks:

**Recommended Workflows:**

1. **Rent Reminders**
```json
{
  "name": "Rent Reminder - 3 Days Before",
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
        "message": "Reminder: Rent due in 3 days"
      }
    }
  ]
}
```

2. **Late Payment Alerts**
3. **Lease Expiration Reminders**
4. **Maintenance Request Routing**

### Step 7: Add Vendors (Optional)

Migrate your existing vendor contacts:

```json
{
  "name": "Vendor Name",
  "category": "plumber",
  "contact": {
    "phone": "254712345678",
    "email": "vendor@example.com"
  },
  "isPreferred": true
}
```

### Step 8: Create Sub-Accounts (Optional)

If you have staff or property managers:

```json
{
  "email": "manager@example.com",
  "phone": "254733123456",
  "firstName": "Jane",
  "lastName": "Smith",
  "accountType": "property_manager",
  "permissions": { ... },
  "assignedProperties": ["property_id_1", "property_id_2"]
}
```

## Data Mapping

### Old Structure → New Structure

#### User Model
```
Old: role: 'landlord'
New: role: 'landlord' + LandlordProfile document
```

#### Property Model
```
Old: landlord: ObjectId
New: landlord: ObjectId (unchanged)
     + Enhanced with verification status
     + Investment analysis fields
```

#### Vendor Model
```
Old: Vendor model (basic)
New: VendorManagement model (enhanced)
     + Performance tracking
     + Rating system
     + Service history
```

## Feature Comparison

| Feature | Old System | New System |
|---------|-----------|------------|
| Authentication | Password only | Password + 2FA (mandatory) |
| Property Management | Basic listing | Full portfolio management |
| User Management | Single account | Multi-user with RBAC |
| Maintenance | Request tracking | Request + Vendor management |
| Financial | Basic tracking | Advanced analytics + Reports |
| Automation | None | Workflow engine |
| Documents | Basic storage | Secure vault with versioning |
| CRM | None | Full contact lifecycle |
| Verification | None | Document-based verification |
| Analytics | Basic stats | Comprehensive dashboards |

## API Changes

### New Endpoints
All new endpoints are under `/landlord/*`:

```
POST   /landlord/accounts
POST   /landlord/2fa/setup
POST   /landlord/2fa/verify
POST   /landlord/service-agreement/accept
POST   /landlord/properties
POST   /landlord/properties/bulk-import
POST   /landlord/verification/documents
POST   /landlord/sub-accounts
PUT    /landlord/sub-accounts/:userId/permissions
GET    /landlord/contacts
POST   /landlord/leases
GET    /landlord/financial/dashboard
GET    /landlord/maintenance/requests
PUT    /landlord/maintenance/requests/:id/assign-vendor
POST   /landlord/workflows
GET    /landlord/workflows
POST   /landlord/workflows/:id/execute
POST   /landlord/vendors
GET    /landlord/vendors
GET    /landlord/analytics/dashboard
POST   /landlord/documents
GET    /landlord/documents
```

### Deprecated Endpoints
None. All old endpoints remain functional for backward compatibility.

### Modified Endpoints
None. Existing endpoints maintain the same behavior.

## Security Enhancements

### Before Migration
- Password authentication
- Basic role checking
- No audit trail

### After Migration
- Password + 2FA (mandatory)
- Granular RBAC
- Complete audit trail
- IP tracking
- Session management
- Trusted devices

## Performance Improvements

1. **Indexes**: Optimized database queries
2. **Pagination**: All list endpoints support pagination
3. **Caching**: Ready for Redis integration
4. **Async Operations**: Non-blocking operations
5. **Query Optimization**: Selective field population

## Rollback Plan

If you encounter issues:

1. **Contact Support**: support@nyumbasync.com
2. **Temporary Access**: Old endpoints remain functional
3. **Data Integrity**: All original data is preserved
4. **No Data Loss**: Migration is additive, not destructive

## Testing Recommendations

Before full migration:

1. **Test in Staging**: Use test account to familiarize
2. **Verify Data**: Check all properties are visible
3. **Test Workflows**: Create and test simple workflow
4. **Check Permissions**: If using sub-accounts
5. **Backup Data**: Export important documents

## Timeline

### Week 1: Preparation
- Review new features
- Plan workflow automation
- Identify staff for sub-accounts
- Gather verification documents

### Week 2: Migration
- Enable 2FA
- Accept service agreement
- Upload verification documents
- Review migrated data

### Week 3: Setup
- Create workflows
- Add vendors
- Create sub-accounts
- Configure preferences

### Week 4: Optimization
- Fine-tune workflows
- Generate reports
- Train staff
- Full adoption

## Common Issues & Solutions

### Issue: Cannot login after migration
**Solution:** Use password reset if needed. 2FA is not required until you set it up.

### Issue: Properties not showing
**Solution:** Check that your user ID matches the landlord field in properties.

### Issue: 2FA setup fails
**Solution:** Ensure device time is synchronized. Try different authenticator app.

### Issue: Verification documents rejected
**Solution:** Review rejection reason. Ensure documents are clear and valid.

### Issue: Workflow not executing
**Solution:** Check workflow status is "active". Review trigger conditions.

### Issue: Sub-account cannot access properties
**Solution:** Verify properties are in assignedProperties array.

## Support & Resources

### Documentation
- API Reference: `/landlord/docs`
- User Guide: `LANDLORD_PORTAL_QUICKSTART.md`
- Implementation Details: `LANDLORD_PORTAL_IMPLEMENTATION.md`

### Support Channels
- Email: support@nyumbasync.com
- Phone: +254 700 000 000
- Live Chat: Available in portal
- Help Center: https://help.nyumbasync.com

### Training
- Video tutorials available
- Webinar schedule: Weekly on Fridays
- One-on-one training: Available on request

## Frequently Asked Questions

### Q: Is migration mandatory?
**A:** Yes, but you have 30 days to complete 2FA setup.

### Q: Will my existing data be affected?
**A:** No, all existing data is preserved and enhanced.

### Q: Can I use old API endpoints?
**A:** Yes, old endpoints remain functional for backward compatibility.

### Q: What if I don't want 2FA?
**A:** 2FA is mandatory for security. Backup codes are provided for emergencies.

### Q: How much does the upgrade cost?
**A:** The upgrade is free. Premium features may require subscription.

### Q: Can I migrate back to old system?
**A:** Old endpoints remain available, but new features won't be accessible.

### Q: How long does verification take?
**A:** Document verification typically takes 1-3 business days.

### Q: Can I have multiple sub-accounts?
**A:** Yes, unlimited sub-accounts based on your subscription plan.

### Q: What happens to my existing workflows?
**A:** If you had custom integrations, they need to be recreated using the new workflow engine.

### Q: Is training provided?
**A:** Yes, documentation, videos, and webinars are available.

## Success Checklist

- [ ] 2FA enabled and verified
- [ ] Service agreement accepted
- [ ] Verification documents uploaded
- [ ] All properties reviewed and updated
- [ ] At least one workflow created
- [ ] Vendors added to database
- [ ] Sub-accounts created (if needed)
- [ ] Financial dashboard reviewed
- [ ] Documents uploaded to vault
- [ ] Staff trained on new features

## Next Steps After Migration

1. **Explore Analytics**: Review financial dashboard
2. **Automate Tasks**: Create more workflows
3. **Optimize Operations**: Use CRM features
4. **Engage Staff**: Train team on new features
5. **Monitor Performance**: Track vendor performance
6. **Generate Reports**: Use reporting features
7. **Provide Feedback**: Help us improve

## Conclusion

The new Landlord Portal provides powerful tools to manage your property portfolio efficiently. Take time to explore features and set up automation to save time and improve operations.

Welcome to the enhanced NyumbaSync experience! 🎉
