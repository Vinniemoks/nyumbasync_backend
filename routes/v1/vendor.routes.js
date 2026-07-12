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
    handler: [authenticate(['admin', 'manager', 'landlord']), asyncHandler(vendorController.createVendor)],
    config: { source: 'vendor.routes' }
  },
  
  // Update vendor
  {
    method: 'PUT',
    path: '/:id',
    handler: [authenticate(['admin', 'manager', 'landlord']), asyncHandler(vendorController.updateVendor)],
    config: { source: 'vendor.routes' }
  },
  
  // Delete vendor
  {
    method: 'DELETE',
    path: '/:id',
    handler: [authenticate(['admin', 'manager', 'landlord']), asyncHandler(vendorController.deleteVendor)],
    config: { source: 'vendor.routes' }
  },

  // Vendor-facing: list requests assigned to the logged-in vendor
  {
    method: 'GET',
    path: '/requests/my',
    handler: [authenticate('vendor'), asyncHandler(vendorController.getVendorRequests)],
    config: { source: 'vendor.routes' }
  },

  // Vendor-facing: accept request
  {
    method: 'POST',
    path: '/requests/:requestId/accept',
    handler: [authenticate('vendor'), asyncHandler(vendorController.acceptVendorRequest)],
    config: { source: 'vendor.routes' }
  },

  // Vendor-facing: start work
  {
    method: 'POST',
    path: '/requests/:requestId/start',
    handler: [authenticate('vendor'), asyncHandler(vendorController.startVendorRequest)],
    config: { source: 'vendor.routes' }
  },

  // Vendor-facing: complete work
  {
    method: 'POST',
    path: '/requests/:requestId/complete',
    handler: [authenticate('vendor'), asyncHandler(vendorController.completeVendorRequest)],
    config: { source: 'vendor.routes' }
  },

  // Vendor-facing: close request
  {
    method: 'POST',
    path: '/requests/:requestId/close',
    handler: [authenticate('vendor'), asyncHandler(vendorController.closeVendorRequest)],
    config: { source: 'vendor.routes' }
  }
];
