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
    const documents = await Document.find({ tenant: tenantId, isArchived: false })
      .populate('uploadedBy', 'firstName lastName email')
      .populate('property', 'address unitNumber')
      .sort('-createdAt');
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching tenant documents:', error);
    res.status(500).json({ error: 'Failed to fetch tenant documents' });
  }
};

// Get documents by landlord
exports.getDocumentsByLandlord = async (req, res) => {
  try {
    const { landlordId } = req.params;
    const documents = await Document.find({ landlord: landlordId, isArchived: false })
      .populate('uploadedBy', 'firstName lastName email')
      .populate('property', 'address unitNumber')
      .sort('-createdAt');
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching landlord documents:', error);
    res.status(500).json({ error: 'Failed to fetch landlord documents' });
  }
};

// Get documents by property
exports.getDocumentsByProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const documents = await Document.find({ property: propertyId, isArchived: false })
      .populate('uploadedBy', 'firstName lastName email')
      .populate('tenant', 'firstName lastName')
      .sort('-createdAt');
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching property documents:', error);
    res.status(500).json({ error: 'Failed to fetch property documents' });
  }
};

// Get documents by lease
exports.getDocumentsByLease = async (req, res) => {
  try {
    const { leaseId } = req.params;
    const documents = await Document.find({ lease: leaseId, isArchived: false })
      .populate('uploadedBy', 'firstName lastName email')
      .sort('-createdAt');
    res.json(documents);
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
    const userId = req.user.id;

    const document = await Document.findOne({
      _id: documentId,
      $or: [
        { uploadedBy: userId },
        { tenant: userId },
        { landlord: userId },
        { 'sharedWith.user': userId }
      ]
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const fs = require('fs');
    if (!fs.existsSync(document.fileUrl)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(document.fileUrl, document.name);
  } catch (error) {
    logger.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
};

// Update document
exports.updateDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const { name, category, description, tags } = req.body;

    const document = await Document.findOneAndUpdate(
      { _id: documentId, uploadedBy: userId },
      { $set: { name, category, description, tags } },
      { new: true, runValidators: true }
    );

    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    res.json({ success: true, document });
  } catch (error) {
    logger.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;

    const document = await Document.findOneAndDelete({
      _id: documentId,
      uploadedBy: userId
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    const fs = require('fs');
    if (document.fileUrl && fs.existsSync(document.fileUrl)) {
      fs.unlinkSync(document.fileUrl);
    }

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
    const userId = req.user.id;
    const { userIds, permission = 'view' } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    const document = await Document.findOne({ _id: documentId, uploadedBy: userId });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    const shareEntries = userIds.map(uid => ({ user: uid, permission }));

    // Add new shares (avoid duplicates)
    for (const entry of shareEntries) {
      const exists = document.sharedWith.some(s => s.user.toString() === entry.user);
      if (!exists) {
        document.sharedWith.push(entry);
      }
    }

    await document.save();

    res.json({ success: true, sharedWith: document.sharedWith });
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
