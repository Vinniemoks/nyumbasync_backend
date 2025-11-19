const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const createUploadDirs = () => {
  const dirs = [
    uploadDir,
    path.join(uploadDir, 'images'),
    path.join(uploadDir, 'documents'),
    path.join(uploadDir, 'properties'),
    path.join(uploadDir, 'maintenance'),
    path.join(uploadDir, 'profiles')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
  });
};

createUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'documents';
    
    // Determine subdirectory based on field name or route
    if (file.fieldname === 'image' || file.mimetype.startsWith('image/')) {
      subDir = 'images';
    }
    if (req.path.includes('/properties')) {
      subDir = 'properties';
    }
    if (req.path.includes('/maintenance')) {
      subDir = 'maintenance';
    }
    if (req.path.includes('/profile')) {
      subDir = 'profiles';
    }
    
    const dir = path.join(uploadDir, subDir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 50);
    
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,gif,pdf,doc,docx').split(',');
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type .${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: 5 // Max 5 files at once
  }
});

// Error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${process.env.MAX_FILE_SIZE || '10MB'}`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 5 files allowed'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected field',
        message: 'Invalid file field name'
      });
    }
  }
  
  if (err) {
    return res.status(400).json({
      error: 'Upload failed',
      message: err.message
    });
  }
  
  next();
};

// Export middleware functions
module.exports = {
  // Single file upload
  uploadSingle: (fieldName = 'file') => [
    upload.single(fieldName),
    handleMulterError
  ],
  
  // Multiple files upload
  uploadMultiple: (fieldName = 'files', maxCount = 5) => [
    upload.array(fieldName, maxCount),
    handleMulterError
  ],
  
  // Multiple fields
  uploadFields: (fields) => [
    upload.fields(fields),
    handleMulterError
  ],
  
  // Specific upload types
  uploadImage: [upload.single('image'), handleMulterError],
  uploadDocument: [upload.single('document'), handleMulterError],
  uploadPropertyImages: [upload.array('images', 10), handleMulterError],
  uploadMaintenancePhotos: [upload.array('photos', 5), handleMulterError],
  
  // Raw multer instance for custom use
  upload
};
