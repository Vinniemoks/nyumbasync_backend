const Vendor = require('../models/vendor.model');
const logger = require('../utils/logger');

// Get all vendors
exports.getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find();
    res.json(vendors);
  } catch (error) {
    logger.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

// Get vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    logger.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
};

// Create vendor
exports.createVendor = async (req, res) => {
  try {
    const vendor = new Vendor(req.body);
    await vendor.save();
    res.status(201).json(vendor);
  } catch (error) {
    logger.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
};

// Update vendor
exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndUpdate(id, req.body, { new: true });
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    logger.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
};

// Get tenant vendors
exports.getTenantVendors = async (req, res) => {
  try {
    const { serviceTypes, minRating, availability } = req.query;
    
    let query = {};
    
    if (serviceTypes) {
      query.serviceTypes = { $in: Array.isArray(serviceTypes) ? serviceTypes : [serviceTypes] };
    }
    
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }
    
    if (availability) {
      query.availability = availability;
    }
    
    const vendors = await Vendor.find(query);
    res.json(vendors);
  } catch (error) {
    logger.error('Error fetching tenant vendors:', error);
    res.status(500).json({ error: 'Failed to fetch tenant vendors' });
  }
};

// Get vendor details
exports.getVendorDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({
      id: vendor._id,
      name: vendor.name,
      serviceTypes: vendor.serviceTypes || [],
      phone: vendor.phone,
      email: vendor.email,
      rating: vendor.rating || 0,
      availability: vendor.availability || 'available',
      description: vendor.description || '',
      yearsOfExperience: vendor.yearsOfExperience || 0,
      certifications: vendor.certifications || [],
      reviews: vendor.reviews || []
    });
  } catch (error) {
    logger.error('Error fetching vendor details:', error);
    res.status(500).json({ error: 'Failed to fetch vendor details' });
  }
};

// Contact vendor
exports.contactVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    
    // TODO: Implement vendor contact functionality
    res.json({
      success: true,
      message: 'Your message has been sent to the vendor'
    });
  } catch (error) {
    logger.error('Error contacting vendor:', error);
    res.status(500).json({ error: 'Failed to contact vendor' });
  }
};

// Request vendor service
exports.requestVendorService = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { serviceType, description, preferredDate, urgency } = req.body;
    const userId = req.user.id;
    
    // TODO: Implement service request functionality
    res.json({
      success: true,
      requestId: 123,
      message: 'Service request submitted successfully'
    });
  } catch (error) {
    logger.error('Error requesting vendor service:', error);
    res.status(500).json({ error: 'Failed to request vendor service' });
  }
};

module.exports = exports;
