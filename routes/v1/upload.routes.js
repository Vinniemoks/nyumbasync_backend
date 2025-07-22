const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('winston');
const sharp = require('sharp'); // You'll need to install: npm install sharp
const router = express.Router();

// Logger (you can import from your main logger configuration)
const logger = createLogger({
  level: 'info',
  format: require('winston').format.simple(),
  transports: [new (require('winston')).transports.Console()]
});

// File storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = req.params.type ? `uploads/${req.params.type}` : 'uploads/general';
    // Create directory if it doesn't exist
    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = req.user ? req.user.id : 'anonymous';
    cb(null, `${userId}-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    all: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };

  const uploadType = req.params.type || 'all';
  const allowed = allowedTypes[uploadType] || allowedTypes.all;

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed for ${uploadType} uploads`));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 10 // Maximum 10 files per request
  },
  fileFilter: fileFilter
});

// Middleware to ensure uploads directory exists
const ensureUploadDir = async (req, res, next) => {
  try {
    await fs.mkdir('uploads', { recursive: true });
    next();
  } catch (error) {
    logger.error('Error creating uploads directory:', error);
    res.status(500).json({
      error: 'Upload system error',
      timestamp: res.locals.currentTime
    });
  }
};

// Image processing middleware
const processImage = async (req, res, next) => {
  if (!req.files && !req.file) return next();
  
  try {
    const files = req.files || [req.file];
    const processedFiles = [];

    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        // Create thumbnail
        const thumbnailPath = file.path.replace(/(\.[^.]+)$/, '-thumb$1');
        await sharp(file.path)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);

        // Optimize original image
        await sharp(file.path)
          .jpeg({ quality: 85 })
          .png({ compressionLevel: 8 })
          .toFile(file.path + '.temp');

        // Replace original with optimized version
        await fs.rename(file.path + '.temp', file.path);

        processedFiles.push({
          ...file,
          thumbnail: thumbnailPath.replace('uploads/', '')
        });
      } else {
        processedFiles.push(file);
      }
    }

    if (req.files) {
      req.files = processedFiles;
    } else {
      req.file = processedFiles[0];
    }

    next();
  } catch (error) {
    logger.error('Image processing error:', error);
    next(); // Continue without processing
  }
};

// Routes

// Upload single file by type (images, documents, etc.)
router.post('/:type', ensureUploadDir, upload.single('file'), processImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        timestamp: res.locals.currentTime
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/${req.file.path}`;
    const thumbnailUrl = req.file.thumbnail ? `${baseUrl}/uploads/${req.file.thumbnail}` : null;

    // Log upload activity
    logger.info(`File uploaded: ${req.file.filename} by user ${req.user.id}`);

    res.status(200).json({
      message: 'File uploaded successfully',
      file: {
        id: req.file.filename,
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl,
        thumbnailUrl: thumbnailUrl,
        uploadType: req.params.type,
        uploadedBy: req.user.id,
        uploadedAt: new Date().toISOString()
      },
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      timestamp: res.locals.currentTime
    });
  }
});

// Upload multiple files by type
router.post('/:type/multiple', ensureUploadDir, upload.array('files', 10), processImage, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        timestamp: res.locals.currentTime
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const files = req.files.map(file => ({
      id: file.filename,
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `${baseUrl}/${file.path}`,
      thumbnailUrl: file.thumbnail ? `${baseUrl}/uploads/${file.thumbnail}` : null,
      uploadType: req.params.type,
      uploadedBy: req.user.id,
      uploadedAt: new Date().toISOString()
    }));

    logger.info(`${files.length} files uploaded by user ${req.user.id}`);

    res.status(200).json({
      message: 'Files uploaded successfully',
      files,
      count: files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0),
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Multiple upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      timestamp: res.locals.currentTime
    });
  }
});

// Get user's uploaded files
router.get('/user/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Only allow users to view their own files unless they're admin
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        timestamp: res.locals.currentTime
      });
    }

    const uploadsDir = 'uploads';
    const files = [];
    
    // Read all subdirectories
    const subdirs = await fs.readdir(uploadsDir);
    
    for (const subdir of subdirs) {
      const subdirPath = path.join(uploadsDir, subdir);
      const stat = await fs.stat(subdirPath);
      
      if (stat.isDirectory()) {
        const dirFiles = await fs.readdir(subdirPath);
        
        for (const filename of dirFiles) {
          if (filename.startsWith(userId) && !filename.includes('-thumb')) {
            const filePath = path.join(subdirPath, filename);
            const fileStats = await fs.stat(filePath);
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            
            files.push({
              id: filename,
              filename: filename,
              size: fileStats.size,
              uploadType: subdir,
              url: `${baseUrl}/${filePath.replace(/\\/g, '/')}`,
              uploadedAt: fileStats.birthtime.toISOString(),
              lastModified: fileStats.mtime.toISOString()
            });
          }
        }
      }
    }

    res.status(200).json({
      message: 'Files retrieved successfully',
      files,
      count: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Error retrieving user files:', error);
    res.status(500).json({
      error: 'Failed to retrieve files',
      timestamp: res.locals.currentTime
    });
  }
});

// Delete a file
router.delete('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = req.user.id;

    // Security check: ensure user can only delete their own files
    if (!filename.startsWith(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        timestamp: res.locals.currentTime
      });
    }

    // Find the file in subdirectories
    let filePath = null;
    let thumbnailPath = null;
    const uploadsDir = 'uploads';
    
    const subdirs = await fs.readdir(uploadsDir);
    
    for (const subdir of subdirs) {
      const subdirPath = path.join(uploadsDir, subdir);
      const stat = await fs.stat(subdirPath);
      
      if (stat.isDirectory()) {
        const possiblePath = path.join(subdirPath, filename);
        try {
          await fs.access(possiblePath);
          filePath = possiblePath;
          
          // Check for thumbnail
          const thumbFilename = filename.replace(/(\.[^.]+)$/, '-thumb$1');
          const possibleThumbPath = path.join(subdirPath, thumbFilename);
          try {
            await fs.access(possibleThumbPath);
            thumbnailPath = possibleThumbPath;
          } catch (e) {
            // Thumbnail doesn't exist, that's okay
          }
          break;
        } catch (e) {
          // File doesn't exist in this directory, continue searching
        }
      }
    }

    if (!filePath) {
      return res.status(404).json({
        error: 'File not found',
        timestamp: res.locals.currentTime
      });
    }

    // Delete the main file
    await fs.unlink(filePath);
    
    // Delete thumbnail if it exists
    if (thumbnailPath) {
      try {
        await fs.unlink(thumbnailPath);
      } catch (e) {
        logger.warn(`Failed to delete thumbnail: ${thumbnailPath}`);
      }
    }

    logger.info(`File deleted: ${filename} by user ${userId}`);

    res.status(200).json({
      message: 'File deleted successfully',
      filename: filename,
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('File deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      timestamp: res.locals.currentTime
    });
  }
});

// Get file metadata
router.get('/info/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = req.user.id;

    // Security check: ensure user can only access their own files
    if (!filename.startsWith(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        timestamp: res.locals.currentTime
      });
    }

    // Find the file in subdirectories
    let filePath = null;
    let uploadType = null;
    const uploadsDir = 'uploads';
    
    const subdirs = await fs.readdir(uploadsDir);
    
    for (const subdir of subdirs) {
      const subdirPath = path.join(uploadsDir, subdir);
      const stat = await fs.stat(subdirPath);
      
      if (stat.isDirectory()) {
        const possiblePath = path.join(subdirPath, filename);
        try {
          await fs.access(possiblePath);
          filePath = possiblePath;
          uploadType = subdir;
          break;
        } catch (e) {
          // File doesn't exist in this directory, continue searching
        }
      }
    }

    if (!filePath) {
      return res.status(404).json({
        error: 'File not found',
        timestamp: res.locals.currentTime
      });
    }

    const fileStats = await fs.stat(filePath);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.status(200).json({
      file: {
        id: filename,
        filename: filename,
        size: fileStats.size,
        uploadType: uploadType,
        url: `${baseUrl}/${filePath.replace(/\\/g, '/')}`,
        uploadedAt: fileStats.birthtime.toISOString(),
        lastModified: fileStats.mtime.toISOString(),
        isImage: filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? true : false
      },
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Error getting file info:', error);
    res.status(500).json({
      error: 'Failed to get file information',
      timestamp: res.locals.currentTime
    });
  }
});

// Clean up old files (admin only)
router.post('/cleanup', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      timestamp: res.locals.currentTime
    });
  }

  try {
    const daysOld = req.body.daysOld || 30; // Default to 30 days
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    let deletedCount = 0;
    let totalSize = 0;
    const uploadsDir = 'uploads';
    
    const subdirs = await fs.readdir(uploadsDir);
    
    for (const subdir of subdirs) {
      const subdirPath = path.join(uploadsDir, subdir);
      const stat = await fs.stat(subdirPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(subdirPath);
        
        for (const filename of files) {
          const filePath = path.join(subdirPath, filename);
          const fileStats = await fs.stat(filePath);
          
          if (fileStats.mtime < cutoffDate) {
            totalSize += fileStats.size;
            await fs.unlink(filePath);
            deletedCount++;
            logger.info(`Cleaned up old file: ${filePath}`);
          }
        }
      }
    }

    res.status(200).json({
      message: 'Cleanup completed',
      filesDeleted: deletedCount,
      spaceFree: totalSize,
      cutoffDate: cutoffDate.toISOString(),
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      timestamp: res.locals.currentTime
    });
  }
});

module.exports = router;