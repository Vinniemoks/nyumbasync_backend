const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const leaseController = require('../../controllers/lease.controller');

module.exports = [
  // Get all leases
  {
    method: 'GET',
    path: '/',
    handler: [authenticate(), asyncHandler(leaseController.getAllLeases)],
    config: { source: 'lease.routes' }
  },
  
  // Get lease by ID
  {
    method: 'GET',
    path: '/:id',
    handler: [authenticate(), asyncHandler(leaseController.getLeaseById)],
    config: { source: 'lease.routes' }
  },
  
  // Create new lease
  {
    method: 'POST',
    path: '/',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.createLease)],
    config: { source: 'lease.routes' }
  },
  
  // Update lease
  {
    method: 'PUT',
    path: '/:id',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.updateLease)],
    config: { source: 'lease.routes' }
  },
  
  // Delete lease
  {
    method: 'DELETE',
    path: '/:id',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.deleteLease)],
    config: { source: 'lease.routes' }
  },
  
  // Get leases by landlord
  {
    method: 'GET',
    path: '/landlord/:landlordId',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.getLeasesByLandlord)],
    config: { source: 'lease.routes' }
  },
  
  // Get leases by tenant
  {
    method: 'GET',
    path: '/tenant/:tenantId',
    handler: [authenticate(), asyncHandler(leaseController.getLeasesByTenant)],
    config: { source: 'lease.routes' }
  },
  
  // Get leases by property
  {
    method: 'GET',
    path: '/property/:propertyId',
    handler: [authenticate(), asyncHandler(leaseController.getLeasesByProperty)],
    config: { source: 'lease.routes' }
  },
  
  // Sign lease
  {
    method: 'POST',
    path: '/:leaseId/sign',
    handler: [authenticate(), asyncHandler(leaseController.signLease)],
    config: { source: 'lease.routes' }
  },
  
  // Renew lease
  {
    method: 'POST',
    path: '/:leaseId/renew',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.renewLease)],
    config: { source: 'lease.routes' }
  },
  
  // Terminate lease
  {
    method: 'POST',
    path: '/:leaseId/terminate',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.terminateLease)],
    config: { source: 'lease.routes' }
  },
  
  // Get lease documents
  {
    method: 'GET',
    path: '/:leaseId/documents',
    handler: [authenticate(), asyncHandler(leaseController.getLeaseDocuments)],
    config: { source: 'lease.routes' }
  },
  
  // Upload lease document
  {
    method: 'POST',
    path: '/:leaseId/documents',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.uploadLeaseDocument)],
    config: { source: 'lease.routes' }
  },
  
  // Get specific lease document
  {
    method: 'GET',
    path: '/:leaseId/documents/:documentId',
    handler: [authenticate(), asyncHandler(leaseController.getLeaseDocument)],
    config: { source: 'lease.routes' }
  },
  
  // Download lease document
  {
    method: 'GET',
    path: '/:leaseId/documents/:documentId/download',
    handler: [authenticate(), asyncHandler(leaseController.downloadLeaseDocument)],
    config: { source: 'lease.routes' }
  },
  
  // Get lease templates
  {
    method: 'GET',
    path: '/templates',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.getLeaseTemplates)],
    config: { source: 'lease.routes' }
  },
  
  // Generate lease from template
  {
    method: 'POST',
    path: '/templates/:templateId/generate',
    handler: [authenticate('landlord', 'manager'), asyncHandler(leaseController.generateLeaseFromTemplate)],
    config: { source: 'lease.routes' }
  }
];
