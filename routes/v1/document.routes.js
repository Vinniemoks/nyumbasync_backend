const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const documentController = require('../../controllers/document.controller');

module.exports = [
  // Get all documents
  {
    method: 'GET',
    path: '/',
    handler: [authenticate(), asyncHandler(documentController.getAllDocuments)],
    config: { source: 'document.routes' }
  },
  
  // Get document by ID
  {
    method: 'GET',
    path: '/:id',
    handler: [authenticate(), asyncHandler(documentController.getDocumentById)],
    config: { source: 'document.routes' }
  },
  
  // Get documents by tenant
  {
    method: 'GET',
    path: '/tenant/:tenantId',
    handler: [authenticate(), asyncHandler(documentController.getDocumentsByTenant)],
    config: { source: 'document.routes' }
  },
  
  // Get documents by landlord
  {
    method: 'GET',
    path: '/landlord/:landlordId',
    handler: [authenticate('landlord', 'manager'), asyncHandler(documentController.getDocumentsByLandlord)],
    config: { source: 'document.routes' }
  },
  
  // Get documents by property
  {
    method: 'GET',
    path: '/property/:propertyId',
    handler: [authenticate(), asyncHandler(documentController.getDocumentsByProperty)],
    config: { source: 'document.routes' }
  },
  
  // Get documents by lease
  {
    method: 'GET',
    path: '/lease/:leaseId',
    handler: [authenticate(), asyncHandler(documentController.getDocumentsByLease)],
    config: { source: 'document.routes' }
  },
  
  // Upload document
  {
    method: 'POST',
    path: '/upload',
    handler: [authenticate(), asyncHandler(documentController.uploadDocument)],
    config: { source: 'document.routes' }
  },
  
  // Download document
  {
    method: 'GET',
    path: '/:documentId/download',
    handler: [authenticate(), asyncHandler(documentController.downloadDocument)],
    config: { source: 'document.routes' }
  },
  
  // Update document metadata
  {
    method: 'PUT',
    path: '/:documentId',
    handler: [authenticate(), asyncHandler(documentController.updateDocument)],
    config: { source: 'document.routes' }
  },
  
  // Delete document
  {
    method: 'DELETE',
    path: '/:documentId',
    handler: [authenticate(), asyncHandler(documentController.deleteDocument)],
    config: { source: 'document.routes' }
  },
  
  // Share document
  {
    method: 'POST',
    path: '/:documentId/share',
    handler: [authenticate(), asyncHandler(documentController.shareDocument)],
    config: { source: 'document.routes' }
  },
  
  // Get document categories
  {
    method: 'GET',
    path: '/categories',
    handler: [authenticate(), asyncHandler(documentController.getDocumentCategories)],
    config: { source: 'document.routes' }
  }
];
