const router = require('express').Router();
const propertyController = require('../../controllers/property.controller');
const { authenticate, authorizeOwnership } = require('../../middlewares/auth.middleware');

// Public routes
router.get('/', propertyController.searchProperties);
router.get('/:id', propertyController.getProperty);

// Landlord-protected routes
router.post('/',
  authenticate('landlord'),
  propertyController.createProperty
);

router.patch('/:id',
  authenticate('landlord'),
  authorizeOwnership('property'),
  propertyController.updateProperty
);

router.patch('/:id/rent',
  authenticate('landlord'),
  authorizeOwnership('property'),
  propertyController.updateRent
);

router.delete('/:id',
  authenticate('landlord'),
  authorizeOwnership('property'),
  propertyController.deleteProperty
);

module.exports = router;