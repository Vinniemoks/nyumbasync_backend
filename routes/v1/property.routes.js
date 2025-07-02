const router = require('express').Router();
const propertyController = require('../../controllers/property.controller');
const { authenticate, validateNairobiLocation } = require('../../middleware');

// Property listings
router.get('/', propertyController.searchProperties);

// Landlord-only routes
router.use(authenticate('landlord'));

router.post('/',
  validateNairobiLocation,
  propertyController.createProperty
);

router.patch('/:id/rent',
  propertyController.updateRent
);

// Public property details
router.get('/:id', 
  authenticate('any'), 
  propertyController.getProperty
);

module.exports = router;
