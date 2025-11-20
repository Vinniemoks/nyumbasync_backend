/**
 * Log Sanitizer
 * Removes sensitive data from logs
 */

const sensitiveFields = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'sessionId',
  'creditCard',
  'cvv',
  'ssn',
  'idNumber',
  'mpesaConsumerKey',
  'mpesaConsumerSecret',
  'twilioAuthToken',
  'emailPassword'
];

/**
 * Sanitize an object by removing or masking sensitive fields
 * @param {Object} obj - Object to sanitize
 * @param {Boolean} mask - Whether to mask (true) or remove (false) sensitive fields
 * @returns {Object} - Sanitized object
 */
const sanitizeObject = (obj, mask = true) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, mask));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field is sensitive
    const isSensitive = sensitiveFields.some(field => 
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      if (mask && typeof value === 'string') {
        // Mask the value (show first 2 and last 2 characters)
        if (value.length > 8) {
          sanitized[key] = `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
        } else {
          sanitized[key] = '***';
        }
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, mask);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Sanitize log message
 * @param {String} message - Log message
 * @param {Object} meta - Metadata object
 * @returns {Object} - Sanitized log data
 */
const sanitizeLog = (message, meta = {}) => {
  return {
    message,
    meta: sanitizeObject(meta, true)
  };
};

/**
 * Sanitize error for logging
 * @param {Error} error - Error object
 * @returns {Object} - Sanitized error
 */
const sanitizeError = (error) => {
  if (!error) return null;

  const sanitized = {
    message: error.message,
    name: error.name,
    code: error.code,
    status: error.status || error.statusCode
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    sanitized.stack = error.stack;
  }

  return sanitized;
};

/**
 * Sanitize request object for logging
 * @param {Object} req - Express request object
 * @returns {Object} - Sanitized request data
 */
const sanitizeRequest = (req) => {
  if (!req) return null;

  const sanitized = {
    method: req.method,
    url: req.url,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };

  // Sanitize headers (remove authorization, cookies, etc.)
  if (req.headers) {
    sanitized.headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'authorization' || lowerKey === 'cookie') {
        sanitized.headers[key] = '[REDACTED]';
      } else {
        sanitized.headers[key] = value;
      }
    }
  }

  // Sanitize query parameters
  if (req.query) {
    sanitized.query = sanitizeObject(req.query);
  }

  // Sanitize body (remove passwords, tokens, etc.)
  if (req.body) {
    sanitized.body = sanitizeObject(req.body);
  }

  // Add user info if available (but not sensitive data)
  if (req.user) {
    sanitized.user = {
      id: req.user._id || req.user.id,
      email: req.user.email,
      role: req.user.role
    };
  }

  return sanitized;
};

/**
 * Create a sanitized logger wrapper
 * @param {Object} logger - Winston logger instance
 * @returns {Object} - Wrapped logger with sanitization
 */
const createSanitizedLogger = (logger) => {
  return {
    info: (message, meta) => {
      const sanitized = sanitizeLog(message, meta);
      logger.info(sanitized.message, sanitized.meta);
    },
    warn: (message, meta) => {
      const sanitized = sanitizeLog(message, meta);
      logger.warn(sanitized.message, sanitized.meta);
    },
    error: (message, meta) => {
      const sanitized = sanitizeLog(message, meta);
      logger.error(sanitized.message, sanitized.meta);
    },
    debug: (message, meta) => {
      const sanitized = sanitizeLog(message, meta);
      logger.debug(sanitized.message, sanitized.meta);
    }
  };
};

module.exports = {
  sanitizeObject,
  sanitizeLog,
  sanitizeError,
  sanitizeRequest,
  createSanitizedLogger,
  sensitiveFields
};
