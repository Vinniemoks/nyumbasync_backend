const express = require('express');
const router = express.Router();
const v1Routes = require('./v1');

// Import new core routes
const contactRoutes = require('./contact.routes');
const propertyV2Routes = require('./property-v2.routes');
const transactionV2Routes = require('./transaction-v2.routes');
const flowsRoutes = require('./flows.routes');
const tenantPortalRoutes = require('./tenant-portal.routes');
const tenantJourneyRoutes = require('./tenant-journey.routes');
const maintenanceRequestRoutes = require('./maintenance-request.routes');
const notificationRoutes = require('./notification.routes');
const communicationRoutes = require('./communication.routes');

// Import middlewares
const { 
  authMiddleware,
  roleMiddleware 
} = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validation');
const {
  requestTracker,
  performanceMonitor
} = require('../middlewares/monitoring.middleware');

// Global middleware for all API routes
router.use(requestTracker);
router.use(performanceMonitor);

// Kenyan timezone middleware
router.use((req, res, next) => {
  req.kenyaTime = new Date().toLocaleString('en-KE', { 
    timeZone: 'Africa/Nairobi' 
  });
  next();
});

// Core application routes (new)
router.use('/contacts', contactRoutes);
router.use('/v2/properties', propertyV2Routes);
router.use('/v2/transactions', transactionV2Routes);
router.use('/flows', flowsRoutes);
router.use('/tenant-portal', tenantPortalRoutes);
router.use('/tenant-journey', tenantJourneyRoutes);
router.use('/maintenance-requests', maintenanceRequestRoutes);
router.use('/notifications', notificationRoutes);
router.use('/communications', communicationRoutes);

// API versioning
const API_VERSION = process.env.API_VERSION || 'v1';
router.use(`/${API_VERSION}`, v1Routes);

// Redirect root to current version
router.get('/', (req, res) => {
  res.redirect(`/${API_VERSION}`);
});

// API documentation route
router.get('/docs', (req, res) => {
  res.json({
    version: API_VERSION,
    description: 'NyumbaSync API Documentation',
    currentVersion: `/${API_VERSION}`,
    status: 'active',
    region: 'Nairobi',
    time: req.kenyaTime
  });
});

// Fallback for USSD
router.post('/ussd', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
    CON Welcome to NyumbaSync
    1. Pay Rent
    2. Report Issue
    3. Contact Landlord
  `);
});

module.exports = router;
