/**
 * File Sanitizer Utility
 * Sanitizes file uploads to prevent path traversal and malicious files
 */

const path = require('path');
const crypto = require('crypto');

class FileSanitizer {
  constructor() {
    // Dangerous file extensions
    this.dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
      '.jar', '.msi', '.app', '.deb', '.rpm', '.dmg', '.pkg', '.sh',
      '.php', '.asp', '.aspx', '.jsp', '.cgi', '.pl', '.py', '.rb'
    ];

    // Allowed file extensions (whitelist)
    this.allowedExtensions = [
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico',
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt',
      '.csv', '.odt', '.ods', '.odp', '.rtf',
      // Archives
      '.zip', '.rar', '.7z', '.tar', '.gz',
      // Media
      '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.wav', '.ogg'
    ];

    // Maximum filename length
    this.maxFilenameLength = 255;
  }

  /**
   * Sanitize filename
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename) {
      throw new Error('Filename is required');
    }

    // Remove path components (prevent directory traversal)
    let sanitized = path.basename(filename);

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove or replace dangerous characters
    sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
    sanitized = sanitized.replace(/\.\./g, '_');
    sanitized = sanitized.replace(/^\.+/, ''); // Remove leading dots
    sanitized = sanitized.replace(/\s+/g, '_'); // Replace spaces with underscores
    sanitized = sanitized.replace(/[^\w\s.-]/g, ''); // Keep only alphanumeric, dots, dashes, underscores

    // Ensure filename is not empty after sanitization
    if (!sanitized || sanitized === '.') {
      sanitized = 'file';
    }

    // Truncate if too long
    if (sanitized.length > this.maxFilenameLength) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      sanitized = name.substring(0, this.maxFilenameLength - ext.length) + ext;
    }

    return sanitized;
  }

  /**
   * Generate unique filename
   * @param {string} originalFilename - Original filename
   * @returns {string} Unique filename with timestamp and random string
   */
  generateUniqueFilename(originalFilename) {
    const sanitized = this.sanitizeFilename(originalFilename);
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');

    return `${name}_${timestamp}_${random}${ext}`;
  }

  /**
   * Validate file extension
   * @param {string} filename - Filename to validate
   * @param {Array} allowedExtensions - Optional custom allowed extensions
   * @returns {Object} Validation result
   */
  validateExtension(filename, allowedExtensions = null) {
    const ext = path.extname(filename).toLowerCase();

    // Check if extension is dangerous
    if (this.dangerousExtensions.includes(ext)) {
      return {
        valid: false,
        error: `File type ${ext} is not allowed for security reasons`
      };
    }

    // Check against whitelist
    const whitelist = allowedExtensions || this.allowedExtensions;
    if (!whitelist.includes(ext)) {
      return {
        valid: false,
        error: `File type ${ext} is not allowed. Allowed types: ${whitelist.join(', ')}`
      };
    }

    return {
      valid: true,
      extension: ext
    };
  }

  /**
   * Validate file size
   * @param {number} size - File size in bytes
   * @param {number} maxSize - Maximum allowed size in bytes
   * @returns {Object} Validation result
   */
  validateSize(size, maxSize = 10 * 1024 * 1024) { // Default 10MB
    if (size > maxSize) {
      return {
        valid: false,
        error: `File size ${this.formatBytes(size)} exceeds maximum allowed size of ${this.formatBytes(maxSize)}`
      };
    }

    return {
      valid: true,
      size
    };
  }

  /**
   * Validate MIME type
   * @param {string} mimetype - File MIME type
   * @param {Array} allowedMimeTypes - Allowed MIME types
   * @returns {Object} Validation result
   */
  validateMimeType(mimetype, allowedMimeTypes = []) {
    if (allowedMimeTypes.length === 0) {
      return { valid: true, mimetype };
    }

    const isAllowed = allowedMimeTypes.some(allowed => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        return mimetype.startsWith(prefix);
      }
      return mimetype === allowed;
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `MIME type ${mimetype} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`
      };
    }

    return {
      valid: true,
      mimetype
    };
  }

  /**
   * Comprehensive file validation
   * @param {Object} file - File object from multer
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateFile(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedExtensions = null,
      allowedMimeTypes = []
    } = options;

    // Validate filename
    try {
      const sanitizedName = this.sanitizeFilename(file.originalname);
      file.sanitizedName = sanitizedName;
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }

    // Validate extension
    const extValidation = this.validateExtension(file.originalname, allowedExtensions);
    if (!extValidation.valid) {
      return extValidation;
    }

    // Validate size
    const sizeValidation = this.validateSize(file.size, maxSize);
    if (!sizeValidation.valid) {
      return sizeValidation;
    }

    // Validate MIME type
    const mimeValidation = this.validateMimeType(file.mimetype, allowedMimeTypes);
    if (!mimeValidation.valid) {
      return mimeValidation;
    }

    return {
      valid: true,
      file: {
        ...file,
        sanitizedName: file.sanitizedName,
        extension: extValidation.extension,
        size: sizeValidation.size,
        mimetype: mimeValidation.mimetype
      }
    };
  }

  /**
   * Detect potential path traversal attempts
   * @param {string} filename - Filename to check
   * @returns {boolean} True if path traversal detected
   */
  detectPathTraversal(filename) {
    const dangerous = [
      '../',
      '..\\',
      './',
      '.\\',
      '%2e%2e',
      '%252e%252e',
      '..%2f',
      '..%5c'
    ];

    const lower = filename.toLowerCase();
    return dangerous.some(pattern => lower.includes(pattern));
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file type category
   * @param {string} mimetype - File MIME type
   * @returns {string} File category
   */
  getFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf')) return 'document';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('sheet') || mimetype.includes('excel')) return 'spreadsheet';
    if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'presentation';
    if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('tar')) return 'archive';
    return 'other';
  }

  /**
   * Sanitize file path
   * @param {string} filePath - File path to sanitize
   * @returns {string} Sanitized path
   */
  sanitizePath(filePath) {
    // Normalize path
    let sanitized = path.normalize(filePath);

    // Remove any parent directory references
    sanitized = sanitized.replace(/\.\./g, '');

    // Ensure path doesn't start with /
    sanitized = sanitized.replace(/^\/+/, '');

    return sanitized;
  }
}

module.exports = new FileSanitizer();
