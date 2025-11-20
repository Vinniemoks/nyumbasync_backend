/**
 * Nyumbasync Core Data Models
 * The Three Pillars: Properties, Contacts, Transactions
 */

const Property = require('./property.model');
const Contact = require('./contact.model');
const Transaction = require('./transaction.model');
const User = require('./user.model');
const Lease = require('./lease.model');
const Payment = require('./payment.model');
const Maintenance = require('./maintenance.model');
const TenantPortalAuth = require('./tenant-portal-auth.model');
const MaintenanceRequest = require('./maintenance-request.model');
const Notification = require('./notification.model');
const Communication = require('./communication.model');
const LandlordProfile = require('./landlord-profile.model');
const VendorManagement = require('./vendor-management.model');
const Workflow = require('./workflow.model');

module.exports = {
  // Core Models - The Three Pillars
  Property,
  Contact,
  Transaction,
  
  // Supporting Models
  User,
  Lease,
  Payment,
  Maintenance,
  TenantPortalAuth,
  MaintenanceRequest,
  Notification,
  Communication,
  
  // Landlord Portal Models
  LandlordProfile,
  VendorManagement,
  Workflow
};
