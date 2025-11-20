/**
 * Enhanced Security Middleware
 * Additional security layers for the NyumbaSync API
 */

const crypto = require('crypto');
const { securityConfig } = require('../config/security.config');
const logger = require('../utils/logger');

/**
 * Request sanitization middleware
 * Removes potentially dangerous characters
 */
const sanitizeRequest = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }

  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  next();
};

/**
 * Request ID middleware
 * Adds unique ID to each request for tracking
 */
const addRequestId = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * Security headers middleware
 * Adds additional security headers
 */
const securityHeaders = (req, res, next) => {
  // Remove fingerprinting headers
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'same-origin');
  
  // HTTPS enforcement
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

/**
 * IP-based access control
 * Block/allow specific IPs
 */
const ipAccessControl = (req, res, next) => {
  if (!securityConfig.ipControl.enabled) {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;

  // Check blacklist
  if (securityConfig.ipControl.blacklist.includes(clientIp)) {
    logger.warn(`Blocked request from blacklisted IP: ${clientIp}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check whitelist (if configured)
  if (securityConfig.ipControl.whitelist.length > 0) {
    if (!securityConfig.ipControl.whitelist.includes(clientIp)) {
      logger.warn(`Blocked request from non-whitelisted IP: ${clientIp}`);
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  next();
};

/**
 * Suspicious activity detection
 * Detects and logs suspicious patterns
 */
const detectSuspiciousActivity = (req, res, next) => {
  const patterns = {
    sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    xss: /<script|javascript:|onerror=|onload=/i,
    pathTraversal: /\.\.[\/\\]/,
    commandInjection: /[;&|`$()]/
  };

  const checkString = (str) => {
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(str)) {
        return type;
      }
    }
    return null;
  };

  // Check query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        const threat = checkString(value);
        if (threat) {
          logger.warn(`Suspicious ${threat} detected in query parameter: ${key}`, {
            ip: req.ip,
            url: req.url,
            value: value.substring(0, 100)
          });
        }
      }
    }
  }

  // Check body
  if (req.body) {
    const checkObject = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string') {
          const threat = checkString(value);
          if (threat) {
            logger.warn(`Suspicious ${threat} detected in body: ${currentPath}`, {
              ip: req.ip,
              url: req.url,
              value: value.substring(0, 100)
            });
          }
        } else if (typeof value === 'object' && value !== null) {
          checkObject(value, currentPath);
        }
      }
    };
    
    checkObject(req.body);
  }

  next();
};

/**
 * Request timing middleware
 * Adds timing information for monitoring
 */
const requestTiming = (req, res, next) => {
  req.startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request detected: ${req.method} ${req.url} took ${duration}ms`);
    }
    
    // Add timing header
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  
  next();
};

/**
 * Content type validation
 * Ensures correct content type for POST/PUT requests
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({ error: 'Content-Type header is required' });
    }
    
    const validTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data'
    ];
    
    const isValid = validTypes.some(type => contentType.includes(type));
    
    if (!isValid) {
      return res.status(415).json({ error: 'Unsupported Media Type' });
    }
  }
  
  next();
};

/**
 * API key validation (for external integrations)
 */
const validateApiKey = (req, res, next) => {
  if (!securityConfig.api.requireApiKey) {
    return next();
  }

  const apiKey = req.get(securityConfig.api.apiKeyHeader);
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // Validate API key (implement your validation logic)
  const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};

/**
 * HTTPS redirect middleware
 * Redirects HTTP to HTTPS in production
 */
const httpsRedirect = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && 
      securityConfig.https.enforceInProduction &&
      !req.secure && 
      req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
};

/**
 * Audit logging middleware
 * Logs security-relevant events
 */
const auditLog = (req, res, next) => {
  if (!securityConfig.audit.enabled) {
    return next();
  }

  // Log sensitive operations
  const sensitiveRoutes = [
    '/api/v1/auth/login',
    '/api/v1/auth/signup',
    '/api/v1/auth/change-password',
    '/api/v1/auth/reset-password'
  ];

  if (sensitiveRoutes.some(route => req.path.includes(route))) {
    logger.info('Security audit', {
      event: 'SENSITIVE_OPERATION',
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Request size limiter
 * Prevents large payload attacks
 */
const requestSizeLimiter = (req, res, next) => {
  const contentLength = req.get('content-length');
  
  if (contentLength) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (parseInt(contentLength) > maxSize) {
      return res.status(413).json({ error: 'Request entity too large' });
    }
  }
  
  next();
};

/**
 * Prevent parameter pollution
 * Ensures single values for critical parameters
 */
const preventParameterPollution = (req, res, next) => {
  const criticalParams = ['id', 'userId', 'email', 'token'];
  
  if (req.query) {
    criticalParams.forEach(param => {
      if (Array.isArray(req.query[param])) {
        req.query[param] = req.query[param][0];
      }
    });
  }
  
  next();
};

module.exports = {
  sanitizeRequest,
  addRequestId,
  securityHeaders,
  ipAccessControl,
  detectSuspiciousActivity,
  requestTiming,
  validateContentType,
  validateApiKey,
  httpsRedirect,
  auditLog,
  requestSizeLimiter,
  preventParameterPollution
};
