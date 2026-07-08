/**
 * Property Routes V2
 * Enhanced routes for core property model
 */

const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/property-v2.controller');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth.middleware');

// Public / read-only routes (must come before :id routes)
router.get('/available', propertyController.getAvailableProperties);
router.get('/public', propertyController.getPublicProperties);
router.get('/stats/areas', propertyController.getAreaStats);
router.get('/stats/rent', propertyController.getRentStats);

// CRUD routes
router.get('/', propertyController.getAllProperties);
router.get('/by-landlord/:landlordId', propertyController.getPropertiesByLandlord);
router.get('/:id/public', propertyController.getPublicPropertyById);
router.get('/:id', propertyController.getPropertyById);
router.post(
  '/',
  authMiddleware,
  roleMiddleware(['landlord', 'agent', 'manager', 'admin', 'super_admin']),
  propertyController.createProperty
);
router.put(
  '/:id',
  authMiddleware,
  roleMiddleware(['landlord', 'agent', 'manager', 'admin', 'super_admin']),
  propertyController.updateProperty
);
router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware(['landlord', 'agent', 'manager', 'admin', 'super_admin']),
  propertyController.deleteProperty
);

// Property-specific actions
router.post('/:id/contacts', authMiddleware, propertyController.linkContact);
router.put('/:id/price', authMiddleware, propertyController.updateListingPrice);
router.post('/:id/calculate-metrics', authMiddleware, propertyController.calculateInvestmentMetrics);
router.post('/:id/occupy', authMiddleware, propertyController.markAsOccupied);
router.post('/:id/vacate', authMiddleware, propertyController.markAsAvailable);
router.post('/:id/interest', authMiddleware, roleMiddleware('tenant'), propertyController.expressInterest);

module.exports = router;
