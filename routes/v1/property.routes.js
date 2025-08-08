const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param, validationResult } = require('express-validator');

// Add debugging for the controller import
console.log('Attempting to import property controller...');
try {
  const propertyController = require('../../controllers/property.controller');
  console.log('Property controller imported successfully:', Object.keys(propertyController));
} catch (error) {
  console.error('Failed to import property controller:', error.message);
  console.error('Error details:', error);
}

const propertyController = require('../../controllers/property.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const validateOccupy = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('tenantId').isMongoId().withMessage('Invalid tenant ID'),
  body('leaseStart').isISO8601().toDate().withMessage('Invalid lease start date'),
  body('leaseEnd').isISO8601().toDate().withMessage('Invalid lease end date'),
  body('houseNumber').isString().notEmpty().withMessage('House number is required'),
  body('rentDueDate').optional().isInt({ min: 1, max: 31 }).withMessage('Rent due date must be between 1 and 31')
];

const validateRentUpdate = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('amount').isInt({ min: 1000, max: 1000000 }).withMessage('Rent amount must be between KES 1,000 and 1,000,000')
];

const validateImage = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('url').isURL().withMessage('Invalid image URL'),
  body('caption').optional().isString().withMessage('Caption must be a string'),
  body('isPrimary').optional().isBoolean().withMessage('isPrimary must be a boolean')
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

router.get('/available', asyncHandler(propertyController.getAvailableProperties));
router.get('/stats/area', asyncHandler(propertyController.getAreaStats));
router.get('/stats/rent', asyncHandler(propertyController.getRentStats));
router.get('/:id', param('id').isMongoId().withMessage('Invalid property ID'), validate, asyncHandler(propertyController.getPropertyDetails));
router.get('/landlord', authenticate('landlord'), asyncHandler(propertyController.getLandlordProperties));
router.put('/:id/rent', authenticate('landlord'), validateRentUpdate, validate, asyncHandler(propertyController.updatePropertyRent));
router.post('/:id/image', authenticate('landlord'), validateImage, validate, asyncHandler(propertyController.addPropertyImage));
router.patch('/:id/available', authenticate('landlord'), param('id').isMongoId().withMessage('Invalid property ID'), validate, asyncHandler(propertyController.markPropertyAvailable));
router.patch('/:id/occupy', authenticate('landlord'), validateOccupy, validate, asyncHandler(propertyController.markHouseOccupied));

router.use((err, req, res, next) => {
  console.error('Property route error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.message });
  }
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return res.status(500).json({ error: 'Database error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
  res.status(500).json({ error: 'Property processing failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

module.exports = router;