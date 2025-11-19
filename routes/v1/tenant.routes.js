const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const tenantController = require('../../controllers/tenant.controller');
const maintenanceController = require('../../controllers/maintenance.controller');
const paymentController = require('../../controllers/payment.controller');
const documentController = require('../../controllers/document.controller');
const messageController = require('../../controllers/message.controller');
const vendorController = require('../../controllers/vendor.controller');
const moveOutController = require('../../controllers/move-out.controller');
const depositController = require('../../controllers/deposit.controller');

module.exports = [
  // Tenant Profile
  {
    method: 'GET',
    path: '/profile',
    handler: [authenticate('tenant'), asyncHandler(tenantController.getProfile)],
    config: { source: 'tenant.routes' }
  },
  
  // Tenant Maintenance Requests
  {
    method: 'GET',
    path: '/maintenance',
    handler: [authenticate('tenant'), asyncHandler(maintenanceController.getTenantMaintenanceRequests)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/maintenance/:id',
    handler: [authenticate('tenant'), asyncHandler(maintenanceController.getTenantMaintenanceRequest)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/maintenance',
    handler: [authenticate('tenant'), asyncHandler(maintenanceController.createMaintenanceRequest)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'PUT',
    path: '/maintenance/:id',
    handler: [authenticate('tenant'), asyncHandler(maintenanceController.updateMaintenanceRequest)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/maintenance/:id/rate',
    handler: [authenticate('tenant'), asyncHandler(maintenanceController.rateMaintenanceRequest)],
    config: { source: 'tenant.routes' }
  },
  
  // Tenant Documents
  {
    method: 'GET',
    path: '/documents',
    handler: [authenticate('tenant'), asyncHandler(documentController.getTenantDocuments)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/documents',
    handler: [authenticate('tenant'), asyncHandler(documentController.uploadTenantDocument)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'DELETE',
    path: '/documents/:id',
    handler: [authenticate('tenant'), asyncHandler(documentController.deleteTenantDocument)],
    config: { source: 'tenant.routes' }
  },
  
  // Tenant Messages
  {
    method: 'GET',
    path: '/messages',
    handler: [authenticate('tenant'), asyncHandler(messageController.getTenantMessages)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/messages',
    handler: [authenticate('tenant'), asyncHandler(messageController.sendTenantMessage)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'PUT',
    path: '/messages/:id/read',
    handler: [authenticate('tenant'), asyncHandler(messageController.markMessageAsRead)],
    config: { source: 'tenant.routes' }
  },
  
  // Tenant Vendors
  {
    method: 'GET',
    path: '/vendors',
    handler: [authenticate('tenant'), asyncHandler(vendorController.getTenantVendors)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/vendors/:id',
    handler: [authenticate('tenant'), asyncHandler(vendorController.getVendorDetails)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/vendors/:vendorId/contact',
    handler: [authenticate('tenant'), asyncHandler(vendorController.contactVendor)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'POST',
    path: '/vendors/:vendorId/request',
    handler: [authenticate('tenant'), asyncHandler(vendorController.requestVendorService)],
    config: { source: 'tenant.routes' }
  },
  
  // Move-Out Requests
  {
    method: 'POST',
    path: '/move-out/request',
    handler: [authenticate('tenant'), asyncHandler(moveOutController.submitMoveOutRequest)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/move-out/status/:requestId',
    handler: [authenticate('tenant'), asyncHandler(moveOutController.getMoveOutStatus)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/move-out/current',
    handler: [authenticate('tenant'), asyncHandler(moveOutController.getCurrentMoveOutRequest)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'DELETE',
    path: '/move-out/request/:requestId',
    handler: [authenticate('tenant'), asyncHandler(moveOutController.cancelMoveOutRequest)],
    config: { source: 'tenant.routes' }
  },
  
  // Deposit Refund
  {
    method: 'POST',
    path: '/deposit/refund',
    handler: [authenticate('tenant'), asyncHandler(depositController.requestDepositRefund)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/deposit/status/:refundId',
    handler: [authenticate('tenant'), asyncHandler(depositController.getDepositRefundStatus)],
    config: { source: 'tenant.routes' }
  },
  {
    method: 'GET',
    path: '/deposit/current',
    handler: [authenticate('tenant'), asyncHandler(depositController.getCurrentDepositRefund)],
    config: { source: 'tenant.routes' }
  }
];
