const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const vendorController = require('../../controllers/vendor.controller');

module.exports = [
  // Get all vendors
  {
    method: 'GET',
    path: '/',
    handler: [authenticate(), asyncHandler(vendorController.getAllVendors)],
    config: { source: 'vendor.routes' }
  },
  
  // Get vendor by ID
  {
    method: 'GET',
    path: '/:id',
    handler: [authenticate(), asyncHandler(vendorController.getVendorById)],
    config: { source: 'vendor.routes' }
  },
  
  // Create vendor (admin/manager only)
  {
    method: 'POST',
    path: '/',
    handler: [authenticate('admin', 'manager', 'landlord'), asyncHandler(vendorController.createVendor)],
    config: { source: 'vendor.routes' }
  },
  
  // Update vendor
  {
    method: 'PUT',
    path: '/:id',
    handler: [authenticate('admin', 'manager', 'landlord'), asyncHandler(vendorController.updateVendor)],
    config: { source: 'vendor.routes' }
  },
  
  // Delete vendor
  {
    method: 'DELETE',
    path: '/:id',
    handler: [authenticate('admin', 'manager', 'landlord'), asyncHandler(vendorController.deleteVendor)],
    config: { source: 'vendor.routes' }
  }
];
