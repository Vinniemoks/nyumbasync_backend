const Document = require('../models/document.model');
const logger = require('../utils/logger');

// Get all documents
exports.getAllDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const documents = await Document.find({
      $or: [
        { uploadedBy: userId },
        { tenant: userId },
        { landlord: userId },
        { 'sharedWith.user': userId }
      ],
      isArchived: false
    })
      .populate('uploadedBy', 'firstName lastName email')
      .populate('tenant', 'firstName lastName')
      .populate('landlord', 'firstName lastName')
      .populate('property', 'address unitNumber')
      .sort('-createdAt');
    
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// Get document by ID
exports.getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const document = await Document.findOne({
      _id: id,
      $or: [
        { uploadedBy: userId },
        { tenant: userId },
        { landlord: userId },
        { 'sharedWith.user': userId }
      ]
    })
      .populate('uploadedBy', 'firstName lastName email')
      .populate('tenant', 'firstName lastName')
      .populate('landlord', 'firstName lastName')
      .populate('property', 'address unitNumber');
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    logger.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

// Get documents by tenant
exports.getDocumentsByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    // TODO: Implement tenant document retrieval
    res.json([]);
  } catch (error) {
    logger.error('Error fetching tenant documents:', error);
    res.status(500).json({ error: 'Failed to fetch tenant documents' });
  }
};

// Get documents by landlord
exports.getDocumentsByLandlord = async (req, res) => {
  try {
    const { landlordId } = req.params;
    // TODO: Implement landlord document retrieval
    res.json([]);
  } catch (error) {
    logger.error('Error fetching landlord documents:', error);
    res.status(500).json({ error: 'Failed to fetch landlord documents' });
  }
};

// Get documents by property
exports.getDocumentsByProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    // TODO: Implement property document retrieval
    res.json([]);
  } catch (error) {
    logger.error('Error fetching property documents:', error);
    res.status(500).json({ error: 'Failed to fetch property documents' });
  }
};

// Get documents by lease
exports.getDocumentsByLease = async (req, res) => {
  try {
    const { leaseId } = req.params;
    // TODO: Implement lease document retrieval
    res.json([]);
  } catch (error) {
    logger.error('Error fetching lease documents:', error);
    res.status(500).json({ error: 'Failed to fetch lease documents' });
  }
};

// Upload document
exports.uploadDocument = async (req, res) => {
  try {
    const { name, category, description, tags, tenantId, landlordId, propertyId, leaseId } = req.body;
    const userId = req.user.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const document = await Document.create({
      name: name || file.originalname,
      category: category || 'other',
      description,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : [],
      fileUrl: file.path,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedBy: userId,
      uploadedByRole: req.user.role,
      tenant: tenantId,
      landlord: landlordId,
      property: propertyId,
      lease: leaseId
    });
    
    res.status(201).json({ success: true, document });
  } catch (error) {
    logger.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Download document
exports.downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    // TODO: Implement document download
    res.json({ success: true, url: '/documents/download/' + documentId });
  } catch (error) {
    logger.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
};

// Update document
exports.updateDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    // TODO: Implement document update
    res.json({ success: true, document: { id: documentId, ...req.body } });
  } catch (error) {
    logger.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    // TODO: Implement document deletion
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

// Share document
exports.shareDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    // TODO: Implement document sharing
    res.json({ success: true });
  } catch (error) {
    logger.error('Error sharing document:', error);
    res.status(500).json({ error: 'Failed to share document' });
  }
};

// Get document categories
exports.getDocumentCategories = async (req, res) => {
  try {
    res.json([
      'lease',
      'inspection',
      'insurance',
      'utilities',
      'personal',
      'other'
    ]);
  } catch (error) {
    logger.error('Error fetching document categories:', error);
    res.status(500).json({ error: 'Failed to fetch document categories' });
  }
};

// Get tenant documents
exports.getTenantDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const documents = await Document.find({
      $or: [
        { uploadedBy: userId },
        { tenant: userId }
      ],
      isArchived: false
    })
      .populate('property', 'address unitNumber')
      .populate('lease', 'startDate endDate')
      .sort('-createdAt');
    
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching tenant documents:', error);
    res.status(500).json({ error: 'Failed to fetch tenant documents' });
  }
};

// Upload tenant document
exports.uploadTenantDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, description } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const document = await Document.create({
      name: name || file.originalname,
      category: category || 'personal',
      description,
      fileUrl: file.path,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedBy: userId,
      uploadedByRole: 'tenant',
      tenant: userId
    });
    
    res.status(201).json({ success: true, document });
  } catch (error) {
    logger.error('Error uploading tenant document:', error);
    res.status(500).json({ error: 'Failed to upload tenant document' });
  }
};

// Delete tenant document
exports.deleteTenantDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const document = await Document.findOneAndDelete({
      _id: id,
      uploadedBy: userId
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }
    
    // Delete physical file
    const fs = require('fs');
    if (fs.existsSync(document.fileUrl)) {
      fs.unlinkSync(document.fileUrl);
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting tenant document:', error);
    res.status(500).json({ error: 'Failed to delete tenant document' });
  }
};

module.exports = exports;
