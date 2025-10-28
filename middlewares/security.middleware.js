const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { isIP } = require('net');

// Rate limiting configurations
const createRateLimiter = (minutes, max, message) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false
});

// IP Whitelist middleware
const ipWhitelist = (allowedIPs = []) => (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // If no IPs specified, allow all
  if (allowedIPs.length === 0) return next();
  
  // Check if client IP is in whitelist
  if (!allowedIPs.some(ip => {
    // Support for CIDR notation
    if (ip.includes('/')) {
      return ipRangeCheck(clientIP, ip);
    }
    return ip === clientIP;
  })) {
    return res.status(403).json({
      error: 'Access denied from this IP address',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Session configuration
const sessionConfig = (mongoUrl) => ({
  secret: process.env.SESSION_SECRET,
  name: 'adminSessionId',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  },
  store: MongoStore.create({
    mongoUrl,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60 // 24 hours
  })
});

// Security middleware configuration
const securityMiddleware = {
  // Rate limiters
  rateLimiters: {
    global: createRateLimiter(15, 100, 'Too many requests from this IP'),
    login: createRateLimiter(15, 5, 'Too many login attempts'),
    adminRoutes: createRateLimiter(15, 50, 'Too many admin requests'),
    api: createRateLimiter(15, 200, 'API rate limit exceeded')
  },

  // Helmet configuration with strict CSP
  helmetConfig: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'same-origin' },
    xssFilter: true
  }),

  // MongoDB sanitization
  mongoSanitize: mongoSanitize(),

  // XSS prevention
  xssClean: xss(),

  // HTTP Parameter Pollution prevention
  hpp: hpp({
    whitelist: [
      'orderBy',
      'status',
      'role',
      'type'
    ]
  })
};

// Export middleware functions
module.exports = {
  ipWhitelist,
  sessionConfig,
  securityMiddleware
};