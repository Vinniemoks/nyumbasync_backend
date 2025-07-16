const Property = require('../models/property.model');
const { validateRentIncrease } = require('../utils/kenyanValidators');

// Get all available properties
exports.searchProperties = async (req, res) => {
  try {
    const { lng, lat, maxDistance = 5000 } = req.query; // meters
    
    const properties = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      },
      status: 'available'
    });

    res.json(properties);
  } catch (err) {
    res.status(500).json({ 
      error: 'Search failed',
      alternative: 'Browse by subcounty instead' 
    });
  }
};

// Get single property details
exports.getProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'name phone');
    
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(property);
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch property',
      contact: '0700NYUMBA for assistance'
    });
  }
};

// Create new property listing
exports.createProperty = async (req, res) => {
  try {
    const { location, rent, deposit } = req.body;

    // Kenyan deposit cap check
    if (deposit > rent * 3) {
      return res.status(400).json({
        error: 'Deposit cannot exceed 3 months rent per Kenyan law'
      });
    }

    const property = await Property.create({
      ...req.body,
      landlord: req.user.id,
      status: 'available'
    });

    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list property',
      localContact: '0700NYUMBA'
    });
  }
};

// Update property details
exports.updateProperty = async (req, res) => {
  try {
    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ 
      error: 'Update failed',
      details: err.message 
    });
  }
};

// Update rent amount
exports.updateRent = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!validateRentIncrease(property.rent, req.body.rent)) {
      return res.status(400).json({
        error: 'Maximum 7% annual increase allowed',
        currentRent: property.rent,
        allowedNewRent: property.rent * 1.07
      });
    }

    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      { rent: req.body.rent },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ 
      error: 'Rent update failed',
      notice: 'Tenant must be notified 2 months in advance' 
    });
  }
};

// Delete property listing
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json({ 
      message: 'Property listing removed',
      refundNotice: 'Any deposits must be refunded within 14 days' 
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to delete property',
      legalContact: 'contact@nyumbasync.co.ke' 
    });
  }
};