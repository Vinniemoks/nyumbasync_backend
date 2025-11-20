/**
 * Property Routes V2
 * Enhanced routes for core property model
 */

const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/property-v2.controller');

// Special routes (must come before :id routes)
router.get('/available', propertyController.getAvailableProperties);
router.get('/by-landlord/:landlordId', propertyController.getPropertiesByLandlord);
router.get('/stats/areas', propertyController.getAreaStats);
router.get('/stats/rent', propertyController.getRentStats);

// CRUD routes
router.get('/', propertyController.getAllProperties);
router.get('/:id', propertyController.getPropertyById);
router.post('/', propertyController.createProperty);
router.put('/:id', propertyController.updateProperty);
router.delete('/:id', propertyController.deleteProperty);

// Property-specific actions
router.post('/:id/contacts', propertyController.linkContact);
router.put('/:id/price', propertyController.updateListingPrice);
router.post('/:id/calculate-metrics', propertyController.calculateInvestmentMetrics);
router.post('/:id/occupy', propertyController.markAsOccupied);
router.post('/:id/vacate', propertyController.markAsAvailable);

module.exports = router;
