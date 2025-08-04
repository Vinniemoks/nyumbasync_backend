const Maintenance = require('../models/maintenance.model');
const Vendor = require('../models/vendor.model');

// Submit repair request
exports.submitRequest = async (req, res) => {
  try {
    const { propertyId, issueType, description } = req.body;

    // Create request
    const request = await Maintenance.create({
      property: propertyId,
      reportedBy: req.user.id,
      issueType,
      description,
      status: 'reported'
    });

    // Auto-assign vendor in Nairobi
    const vendor = await Vendor.findOne({
      subcounties: req.property.subcounty,
      services: issueType,
      available: true
    }).sort('avgResponseTime');

    if (vendor) {
      request.assignedVendor = vendor._id;
      request.status = 'assigned';
      await request.save();
      
      // TODO: Send WhatsApp alert to vendor
    }

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ 
      error: 'Request submission failed',
      emergencyContact: '0709119119 (Nairobi County)' 
    });
  }
};

// Vendor updates status
exports.updateStatus = async (req, res) => {
  try {
    const { status, completionProof } = req.body;

    const request = await Maintenance.findById(req.params.id);

    // Validate vendor ownership
    if (req.user.role === 'vendor' && 
        !request.assignedVendor.equals(req.user._id)) {
      return res.status(403).json({ 
        error: 'Unauthorized - Assigned vendor only' 
      });
    }

    request.status = status;
    if (completionProof) request.completionProof = completionProof;
    await request.save();

    // TODO: Notify tenant via SMS

    res.json(request);
  } catch (err) {
    res.status(500).json({ 
      error: 'Status update failed',
      action: 'Call tenant directly if urgent' 
    });
  }
};

// Add these functions:
exports.getMyRequests = async (req, res) => {
  // Implement logic to fetch requests for the logged-in tenant
  res.json([]); // Placeholder
};

exports.getPropertyRequests = async (req, res) => {
  // Implement logic to fetch requests for a property (landlord view)
  res.json([]); // Placeholder
};

