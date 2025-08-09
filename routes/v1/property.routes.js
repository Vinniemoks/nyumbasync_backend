const asyncHandler = require('express-async-handler');
const { body, param, validationResult } = require('express-validator');
const propertyController = require('../../controllers/property.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Define validation middleware properly
const validatePropertyId = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  }
];

const validateOccupy = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('tenantId').isMongoId().withMessage('Invalid tenant ID'),
  body('leaseStart').isISO8601().toDate().withMessage('Invalid lease start date'),
  body('leaseEnd').isISO8601().toDate().withMessage('Invalid lease end date'),
  body('houseNumber').isString().notEmpty().withMessage('House number is required'),
  body('rentDueDate').optional().isInt({ min: 1, max: 31 }).withMessage('Rent due date must be between 1 and 31'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  }
];

const validateRentUpdate = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('amount').isInt({ min: 1000, max: 1000000 }).withMessage('Rent amount must be between KES 1,000 and 1,000,000'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  }
];

const validateImage = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('url').isURL().withMessage('Invalid image URL'),
  body('caption').optional().isString().withMessage('Caption must be a string'),
  body('isPrimary').optional().isBoolean().withMessage('isPrimary must be a boolean'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  }
];

const validateAvailable = [
  param('id').isMongoId().withMessage('Invalid property ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  }
];

module.exports = [
  // Public routes (no auth required)
  {
    method: 'GET',
    path: '/available',
    handler: asyncHandler(propertyController.getAvailableProperties),
    config: { source: 'property.routes' }
  },
  {
    method: 'GET',
    path: '/stats/area',
    handler: asyncHandler(propertyController.getAreaStats),
    config: { source: 'property.routes' }
  },
  {
    method: 'GET',
    path: '/stats/rent',
    handler: asyncHandler(propertyController.getRentStats),
    config: { source: 'property.routes' }
  },
  {
    method: 'GET',
    path: '/:id',
    handler: [
      ...validatePropertyId,
      asyncHandler(propertyController.getPropertyDetails)
    ],
    config: { source: 'property.routes' }
  },

  // Landlord routes
  {
    method: 'GET',
    path: '/landlord',
    handler: [
      authenticate('landlord'),
      asyncHandler(propertyController.getLandlordProperties)
    ],
    config: { source: 'property.routes' }
  },

  {
    method: 'POST',
    path: '/',
    handler: [
      authenticate('landlord'),
      asyncHandler(propertyController.createProperty)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'PUT',
    path: '/:id',
    handler: [
      authenticate('landlord'),
      ...validatePropertyId,
      asyncHandler(propertyController.updateProperty)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'DELETE',
    path: '/:id',
    handler: [
      authenticate('landlord'),
      ...validatePropertyId,
      asyncHandler(propertyController.deleteProperty)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'PUT',
    path: '/:id/rent',
    handler: [
      authenticate('landlord'),
      ...validateRentUpdate,
      asyncHandler(propertyController.updatePropertyRent)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'POST',
    path: '/:id/image',
    handler: [
      authenticate('landlord'),
      ...validateImage,
      asyncHandler(propertyController.addPropertyImage)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'PATCH',
    path: '/:id/available',
    handler: [
      authenticate('landlord'),
      ...validateAvailable,
      asyncHandler(propertyController.markPropertyAvailable)
    ],
    config: { source: 'property.routes' }
  },
  {
    method: 'PATCH',
    path: '/:id/occupy',
    handler: [
      authenticate('landlord'),
      ...validateOccupy,
      asyncHandler(propertyController.markHouseOccupied)
    ],
    config: { source: 'property.routes' }
  }
];