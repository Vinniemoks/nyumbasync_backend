const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const Property = require('../../models/Property');
const { check, validationResult } = require('express-validator');
const geolib = require('geolib');

// @route   GET api/v1/properties
// @desc    Get properties with optional filters and location-based search
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Extract query parameters
    const { lng, lat, maxDistance = 5000, minRent, maxRent, type, bedrooms } = req.query;

    // Base query
    let query = { isAvailable: true };

    // Rent range filter
    if (minRent || maxRent) {
      query.rent = {};
      if (minRent) query.rent.$gte = Number(minRent);
      if (maxRent) query.rent.$lte = Number(maxRent);
    }

    // Property type filter
    if (type) {
      query.type = type;
    }

    // Bedrooms filter
    if (bedrooms) {
      query.bedrooms = Number(bedrooms);
    }

    // Get all properties that match non-geo filters
    let properties = await Property.find(query)
      .populate('landlord', ['name', 'phone', 'avatar'])
      .lean(); // Using lean() for better performance

    // If location parameters are provided, filter by distance
    if (lng && lat) {
      const referencePoint = { longitude: Number(lng), latitude: Number(lat) };
      
      properties = properties.filter(property => {
        if (!property.location || !property.location.coordinates) return false;
        
        const propertyPoint = {
          longitude: property.location.coordinates[0],
          latitude: property.location.coordinates[1]
        };

        const distance = geolib.getDistance(referencePoint, propertyPoint);
        property.distance = distance; // Add distance to property object
        return distance <= maxDistance;
      });

      // Sort by distance (nearest first)
      properties.sort((a, b) => a.distance - b.distance);
    }

    res.json(properties);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/v1/properties/:id
// @desc    Get property by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', ['name', 'phone', 'avatar', 'verified']);

    if (!property) {
      return res.status(404).json({ msg: 'Property not found' });
    }

    res.json(property);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Property not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/v1/properties
// @desc    Create a new property
// @access  Private (Landlord)
router.post(
  '/',
  [
    auth,
    [
      check('title', 'Title is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('rent', 'Rent amount is required').isNumeric(),
      check('subcounty', 'Subcounty is required').not().isEmpty(),
      check('location', 'Location coordinates are required').exists()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify user is a landlord
    if (req.user.role !== 'landlord') {
      return res.status(403).json({ msg: 'Only landlords can create properties' });
    }

    const {
      title,
      description,
      rent,
      type,
      bedrooms,
      bathrooms,
      subcounty,
      location,
      amenities,
      images
    } = req.body;

    try {
      const newProperty = new Property({
        landlord: req.user.id,
        title,
        description,
        rent,
        type: type || 'Apartment',
        bedrooms: bedrooms || 1,
        bathrooms: bathrooms || 1,
        subcounty,
        location: {
          type: 'Point',
          coordinates: [location.lng, location.lat]
        },
        amenities: amenities || [],
        images: images || []
      });

      const property = await newProperty.save();
      res.json(property);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   PUT api/v1/properties/:id
// @desc    Update a property
// @access  Private (Landlord - owner only)
router.put('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ msg: 'Property not found' });
    }

    // Check if user is the landlord who owns the property
    if (property.landlord.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    // Update fields
    const updates = req.body;
    Object.keys(updates).forEach(key => {
      property[key] = updates[key];
    });

    // Special handling for location
    if (updates.location) {
      property.location = {
        type: 'Point',
        coordinates: [updates.location.lng, updates.location.lat]
      };
    }

    await property.save();
    res.json(property);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/v1/properties/:id
// @desc    Delete a property
// @access  Private (Landlord - owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ msg: 'Property not found' });
    }

    // Check if user is the landlord who owns the property
    if (property.landlord.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    await property.remove();
    res.json({ msg: 'Property removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;