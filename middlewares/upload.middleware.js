const multer = require('multer');
const path = require('path');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary storage for maintenance images
const maintenanceStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'maintenance',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto:good' }
    ]
  }
});

// Configure Cloudinary storage for property images
const propertyStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'properties',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 2000, height: 2000, crop: 'limit' },
      { quality: 'auto:good' }
    ]
  }
});

// Configure Cloudinary storage for documents
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto'
  }
});

// File filters
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const documentFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images and PDF files are allowed!'), false);
  }
};

// Upload middleware configurations
const maintenanceUpload = multer({
  storage: maintenanceStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const propertyUpload = multer({
  storage: propertyStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const documentUpload = multer({
  storage: documentStorage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB
  }
});

// Error handler middleware for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size limit exceeded',
        details: 'Maximum file size allowed is 5MB for maintenance images, 10MB for property images, and 15MB for documents'
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      error: 'Invalid file type',
      details: err.message
    });
  }
  
  next();
};

module.exports = {
  maintenanceUpload,
  propertyUpload,
  documentUpload,
  handleUploadError
};