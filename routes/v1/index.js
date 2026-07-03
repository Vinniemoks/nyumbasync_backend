const express = require('express');
const router = express.Router();
const { asRouter } = require('../utils/route-adapter');

// Import core route modules. Some modules export an Express router, others
// export an array of declarative route definitions — asRouter handles both.
const adminRoutes = require('./admin.routes');
const authRoutes = require('./auth.routes');
const landlordRoutes = require('./landlord.routes');
const maintenanceRoutes = require('./maintenance.routes');
const mpesaRoutes = require('./mpesa.routes');
const paymentRoutes = require('./payment.routes');
const invoiceRoutes = require('./invoice.routes');
const withdrawalRoutes = require('./withdrawal.routes');
const subscriptionRoutes = require('./subscription.routes');
const propertyRoutes = require('./property.routes');
const transactionRoutes = require('./transaction.routes');
const uploadRoutes = require('./upload.routes');
const userRoutes = require('./user.routes');
const propertyApprovalRoutes = require('./property-approval.routes');
const tenantRoutes = require('./tenant.routes');
const vendorRoutes = require('./vendor.routes');
const leaseRoutes = require('./lease.routes');
const documentRoutes = require('./document.routes');
const messageRoutes = require('./message.routes');
const mfaRoutes = require('./mfa.routes');
const auditRoutes = require('./audit.routes');
const enhancedAdminRoutes = require('./enhanced-admin.routes');

// Import feature route modules
const financialRoutes = require('./financial.routes');
const searchRoutes = require('./search.routes');
const backupRoutes = require('./backup.routes');
const monitoringRoutes = require('./monitoring.routes');
const analyticsRoutes = require('./analytics.routes');
const configRoutes = require('./config.routes');
const notificationRoutes = require('./notification.routes');
const aiRoutes = require('./ai.routes');
const biometricRoutes = require('./biometric.routes');
const videoCallRoutes = require('./videoCall.routes');
const reportsRoutes = require('./reports.routes');

// Core route mounting
router.use('/admin', asRouter(adminRoutes, 'admin.routes'));
router.use('/auth', asRouter(authRoutes, 'auth.routes'));
router.use('/landlord', asRouter(landlordRoutes, 'landlord.routes'));
router.use('/maintenance', asRouter(maintenanceRoutes, 'maintenance.routes'));
router.use('/mpesa', asRouter(mpesaRoutes, 'mpesa.routes'));
router.use('/payments', asRouter(paymentRoutes, 'payment.routes'));
router.use('/invoices', asRouter(invoiceRoutes, 'invoice.routes'));
router.use('/withdrawals', asRouter(withdrawalRoutes, 'withdrawal.routes'));
router.use('/subscriptions', asRouter(subscriptionRoutes, 'subscription.routes'));
router.use('/properties', asRouter(propertyRoutes, 'property.routes'));
router.use('/transactions', asRouter(transactionRoutes, 'transaction.routes'));
router.use('/upload', asRouter(uploadRoutes, 'upload.routes'));
router.use('/users', asRouter(userRoutes, 'user.routes'));
router.use('/property-approvals', asRouter(propertyApprovalRoutes, 'property-approval.routes'));

// Tenant self-service portal (GET /tenant/profile, /tenant/maintenance, ...)
router.use('/tenant', asRouter(tenantRoutes, 'tenant.routes'));

// Previously unmounted resources
router.use('/vendors', asRouter(vendorRoutes, 'vendor.routes'));
router.use('/leases', asRouter(leaseRoutes, 'lease.routes'));
router.use('/documents', asRouter(documentRoutes, 'document.routes'));
router.use('/messages', asRouter(messageRoutes, 'message.routes'));
router.use('/mfa', asRouter(mfaRoutes, 'mfa.routes'));
router.use('/audit', asRouter(auditRoutes, 'audit.routes'));
router.use('/enhanced-admin', asRouter(enhancedAdminRoutes, 'enhanced-admin.routes'));

// Feature route mounting
router.use('/financial', asRouter(financialRoutes, 'financial.routes'));
router.use('/search', asRouter(searchRoutes, 'search.routes'));
router.use('/backup', asRouter(backupRoutes, 'backup.routes'));
router.use('/monitoring', asRouter(monitoringRoutes, 'monitoring.routes'));
router.use('/analytics', asRouter(analyticsRoutes, 'analytics.routes'));
router.use('/config', asRouter(configRoutes, 'config.routes'));
router.use('/notifications', asRouter(notificationRoutes, 'notification.routes'));
router.use('/ai', asRouter(aiRoutes, 'ai.routes'));
router.use('/biometric', asRouter(biometricRoutes, 'biometric.routes'));
router.use('/video-call', asRouter(videoCallRoutes, 'videoCall.routes'));
router.use('/reports', asRouter(reportsRoutes, 'reports.routes'));

// Contract-gap routes: fills endpoints the clients call that no dedicated
// module provides (/tenant extras, /tenants, /rent-payments, /reports
// aliases, admin emergency broadcast). Mounted last so specific routers win.
router.use('/', require('./compat.routes'));

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;
