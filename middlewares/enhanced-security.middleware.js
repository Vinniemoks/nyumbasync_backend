const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const csrf = require('csurf');
const { cache } = require('../utils/cache');

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'],
  skip: (req) => req.path.startsWith('/health')
});

const securityMiddleware = {
  // Basic security headers
  helmet: helmet({
    contentSecurityPolicy: process.env.ENABLE_HELMET === 'true',
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: process.env.ENABLE_XSS_PROTECTION === 'true'
  }),

  // CSRF Protection
  csrf: csrf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: parseInt(process.env.CSRF_TOKEN_EXPIRY) || 3600000
    }
  }),

  // Rate limiters
  standardLimiter: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    parseInt(process.env.RATE_LIMIT_TIER1_RPM) || 60,
    'Too many requests, please try again later.'
  ),

  strictLimiter: createRateLimiter(
    15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_TIER2_RPM) || 30,
    'Rate limit exceeded for sensitive operations.'
  ),

  // Session management
  session: (req, res, next) => {
    if (!req.session) {
      return next(new Error('Session store is not configured'));
    }

    // Set session parameters
    req.session.cookie.maxAge = parseInt(process.env.SESSION_DURATION) || 86400000;
    req.session.cookie.secure = process.env.NODE_ENV === 'production';
    req.session.cookie.httpOnly = true;
    req.session.cookie.sameSite = 'strict';

    // Check for session expiry
    if (req.session.lastActivity) {
      const inactiveTime = Date.now() - req.session.lastActivity;
      const timeout = parseInt(process.env.SESSION_INACTIVE_TIMEOUT) || 1800000;

      if (inactiveTime > timeout) {
        return res.status(440).json({ error: 'Session expired' });
      }
    }

    req.session.lastActivity = Date.now();
    next();
  },

  // Cache control
  cacheControl: (duration) => (req, res, next) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `public, max-age=${duration}`);
    } else {
      res.set('Cache-Control', 'no-store');
    }
    next();
  },

  // Error handling
  errorHandler: (err, req, res, next) => {
    console.error('Security Middleware Error:', err);

    // Handle CSRF token errors
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({
        error: 'Invalid CSRF token',
        message: 'Form submission failed. Please try again.'
      });
    }

    // Handle rate limit errors
    if (err.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: err.message
      });
    }

    next(err);
  }
};

module.exports = securityMiddleware;