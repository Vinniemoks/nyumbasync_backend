const express = require('express');
const router = express.Router();

// Import core route modules
const adminRoutes = require('./admin.routes');
const authRoutes = require('./auth.routes');
const maintenanceRoutes = require('./maintenance.routes');
const mpesaRoutes = require('./mpesa.routes');
const paymentRoutes = require('./payment.routes');
const propertyRoutes = require('./property.routes');
const transactionRoutes = require('./transaction.routes');
const uploadRoutes = require('./upload.routes');
const userRoutes = require('./user.routes');
const propertyApprovalRoutes = require('./property-approval.routes');

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
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/mpesa', mpesaRoutes);
router.use('/payments', paymentRoutes);
router.use('/properties', propertyRoutes);
router.use('/transactions', transactionRoutes);
router.use('/upload', uploadRoutes);
router.use('/users', userRoutes);
router.use('/property-approvals', propertyApprovalRoutes);

// Feature route mounting
router.use('/financial', financialRoutes);
router.use('/search', searchRoutes);
router.use('/backup', backupRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/config', configRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);
router.use('/biometric', biometricRoutes);
router.use('/video-call', videoCallRoutes);
router.use('/reports', reportsRoutes);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;