const express = require('express');
const router = express.Router();

// Import route modules
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
const financialRoutes = require('./financial.routes');
const aiRoutes = require('./ai.routes');

// Mount routes
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/financial', financialRoutes);
router.use('/ai', aiRoutes);
router.use('/mpesa', mpesaRoutes);
router.use('/payments', paymentRoutes);
router.use('/properties', propertyRoutes);
router.use('/transactions', transactionRoutes);
router.use('/upload', uploadRoutes);
router.use('/users', userRoutes);
router.use('/property-approvals', propertyApprovalRoutes);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;