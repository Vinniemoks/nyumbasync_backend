require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const compression = require('compression');
const multer = require('multer');
const cluster = require('cluster');
const { createLogger, format, transports } = require('winston');

// Import security configuration and middleware
const { securityConfig, validateSecurityConfig } = require('./config/security.config');
const {
  addRequestId,
  securityHeaders,
  detectSuspiciousActivity,
  requestTiming,
  httpsRedirect,
  auditLog,
  requestSizeLimiter,
  preventParameterPollution
} = require('./middlewares/security.middleware');

// Import load balancing utilities
const LoadBalancer = require('./utils/load-balancer');
const WorkerHealth = require('./utils/worker-health');
const WorkerRateLimiter = require('./utils/worker-rate-limiter');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize worker monitoring if in cluster mode
let workerHealth;
let workerRateLimiter;
if (cluster.isWorker) {
  workerHealth = new WorkerHealth();
  workerRateLimiter = new WorkerRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    maxRequestsPerIP: parseInt(process.env.MAX_REQUESTS_PER_IP || '100'),
    maxRequestsPerWorker: parseInt(process.env.MAX_REQUESTS_PER_WORKER || '1000')
  });
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Winston Logger Configuration
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

// Route Factory Function to convert array configs to Express routers
const createRouterFromConfig = (routeConfigs) => {
  if (!Array.isArray(routeConfigs)) {
    throw new Error('Route config must be an array');
  }

  const router = express.Router();

  routeConfigs.forEach((routeConfig, index) => {
    const { method, path, handler, config } = routeConfig;

    if (!method || !path || !handler) {
      throw new Error(`Invalid route config at index ${index}: missing method, path, or handler`);
    }

    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
      throw new Error(`Invalid route path at index ${index}: "${path}"`);
    }

    const httpMethod = method.toLowerCase();

    // Validate HTTP method
    if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(httpMethod)) {
      throw new Error(`Invalid HTTP method: ${method}`);
    }

    // Ensure handler is an array
    const handlers = Array.isArray(handler) ? handler : [handler];

    // Register the route
    try {
      router[httpMethod](path, ...handlers);
      logger.error(`❌ Route file does not exist: ${routePath}`);
      return null;
    }

    // Check file permissions
    try {
      fs.accessSync(routePath, fs.constants.R_OK);
      logger.debug(`✅ File is readable: ${routePath}`);
    } catch (accessErr) {
      logger.error(`❌ File is not readable: ${routePath}`, accessErr.message);
      return null;
    }

    // Get file stats for debugging
    const stats = fs.statSync(routePath);
    logger.debug(`📊 File stats for ${routeName}: Size: ${stats.size} bytes, Modified: ${stats.mtime}`);

    // Clear require cache in development to avoid stale modules
    if (process.env.NODE_ENV === 'development') {
      delete require.cache[require.resolve(routePath)];
      logger.debug(`🧹 Cleared require cache for: ${routePath}`);
    }

    // Attempt to require the route
    const routeConfig = require(routePath);

    // Validate the loaded route
    if (!routeConfig) {
      logger.error(`❌ ${routeName} route file exists but exports null/undefined`);
      return null;
    }

    // Check if it's already an Express router
    if (routeConfig && routeConfig.stack && Array.isArray(routeConfig.stack)) {
      logger.info(`✅ ${routeName} routes loaded successfully with ${routeConfig.stack.length} route(s)`);
      return routeConfig;
    }

    // Check if it's an array configuration (your current format)
    if (Array.isArray(routeConfig)) {
      logger.info(`🏭 Converting ${routeName} array config to Express router...`);
      try {
        const router = createRouterFromConfig(routeConfig);
        logger.info(`✅ ${routeName} routes converted successfully with ${routeConfig.length} route(s)`);

        // Log individual routes in debug mode
        if (process.env.LOG_LEVEL === 'debug') {
          routeConfig.forEach((config, index) => {
            logger.debug(`  📍 Route ${index + 1}: ${config.method.toUpperCase()} ${config.path}`);
          });
        }

        return router;
      } catch (conversionError) {
        logger.error(`❌ Failed to convert ${routeName} array config:`, conversionError.message);
        return null;
      }
    }

    // If it's a function, assume it's middleware
    if (typeof routeConfig === 'function') {
      logger.info(`✅ ${routeName} middleware function loaded successfully`);
      return routeConfig;
    }

    logger.error(`❌ ${routeName} exports unknown type: ${typeof routeConfig}. Expected Express router, array, or function.`);
    return null;

  } catch (err) {
    // Detailed error logging based on error type
    if (err.code === 'MODULE_NOT_FOUND') {
      logger.error(`❌ ${routeName} routes - Module not found error:`, {
        message: err.message,
        requireStack: err.requireStack,
        modulePath: routePath
      });

      // Check if it's a dependency issue
      if (err.message.includes('Cannot find module') && !err.message.includes(routePath)) {
        const missingModule = err.message.match(/Cannot find module '([^']+)'/);
        if (missingModule) {
          logger.error(`💡 Missing dependency in ${routeName}: ${missingModule[1]}`);
          logger.error(`💡 Try running: npm install ${missingModule[1]}`);
        }
      }
    } else if (err instanceof SyntaxError) {
      logger.error(`❌ ${routeName} routes - Syntax error:`, {
        message: err.message,
        stack: err.stack,
        filePath: routePath
      });
    } else if (err.code === 'ENOENT') {
      logger.error(`❌ ${routeName} routes - File not found: ${routePath}`);
    } else if (err.code === 'EACCES') {
      logger.error(`❌ ${routeName} routes - Permission denied: ${routePath}`);
    } else {
      logger.error(`❌ ${routeName} routes - Unexpected error:`, {
        name: err.name,
        message: err.message,
        code: err.code,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        filePath: routePath
      });
    }

    return null;
  }
};

// Route Loading Summary Function
total: routesToLoad.length,
  loaded: 0,
    failed: 0
  };

// Load each route and track results
routesToLoad.forEach(routeName => {
  logger.info(`\n📂 Loading ${routeName} routes...`);
  const route = loadRoute(routeName);

  if (route) {
    loadedRoutes[routeName] = route;
    routeStats.loaded++;
    logger.info(`✅ ${routeName} routes loaded successfully`);
  } else {
    failedRoutes.push(routeName);
    routeStats.failed++;
    logger.error(`❌ ${routeName} routes failed to load`);
  }
});

// Summary logging
logger.info('\n📊 Route Loading Summary:');
logger.info(`   Total routes attempted: ${routeStats.total}`);
logger.info(`   Successfully loaded: ${routeStats.loaded}`);
logger.info(`   Failed to load: ${routeStats.failed}`);

if (routeStats.loaded > 0) {
  logger.info(`   ✅ Loaded routes: ${Object.keys(loadedRoutes).join(', ')}`);
}

if (failedRoutes.length > 0) {
  logger.error(`   ❌ Failed routes: ${failedRoutes.join(', ')}`);
  logger.error('   💡 Check the individual error messages above for details');
}

if (routeStats.failed === 0) {
  logger.info('🎉 All routes loaded successfully!');
} else if (routeStats.loaded === 0) {
  logger.error('🚨 No routes were loaded! Check your routes directory structure.');
} else {
  logger.warn(`⚠️ Partial success: ${routeStats.loaded}/${routeStats.total} routes loaded`);
}

return loadedRoutes;
};

// Directory Structure Checker
const checkRouteDirectoryStructure = () => {
  const routesDir = path.join(__dirname, 'routes');
  const v1Dir = path.join(routesDir, 'v1');

  logger.info('🔍 Checking route directory structure...');

  if (!fs.existsSync(routesDir)) {
    logger.error('❌ Routes directory does not exist:', routesDir);
    logger.error('💡 Create the directory structure: routes/v1/');
    return false;
  }

  if (!fs.existsSync(v1Dir)) {
    logger.error('❌ v1 routes directory does not exist:', v1Dir);
    logger.error('💡 Create the directory: routes/v1/');
    return false;
  }

  // List all files in the v1 directory
  try {
    const files = fs.readdirSync(v1Dir);
    const routeFiles = files.filter(file => file.endsWith('.routes.js'));

    logger.info(`📁 Found ${files.length} file(s) in routes/v1/:`);
    files.forEach(file => {
      const filePath = path.join(v1Dir, file);
      const stats = fs.statSync(filePath);
      const isRouteFile = file.endsWith('.routes.js');
      logger.info(`   ${isRouteFile ? '📄' : '📋'} ${file} (${stats.size} bytes)`);
    });

    logger.info(`🎯 Found ${routeFiles.length} route file(s):`);
    routeFiles.forEach(file => {
      logger.info(`   📄 ${file}`);
    });

    return true;
  } catch (err) {
    logger.error('❌ Error reading routes directory:', err.message);
    return false;
  }
};

// Validate route handlers
const validateRouteHandlers = (routes) => {
  const validationErrors = [];

  const validateHandler = (handler, path) => {
    if (typeof handler !== 'function') {
      validationErrors.push(`Invalid handler for path: ${path}`);
    }
  };

  routes.stack?.forEach(layer => {
    if (layer.route) {
      Object.values(layer.route.methods).forEach(method => {
        layer.route.stack.forEach(routeLayer => {
          validateHandler(routeLayer.handle, `${method.toUpperCase()} ${layer.route.path}`);
        });
      });
    }
  });

  if (validationErrors.length > 0) {
    throw new Error(`Route validation failed:\n${validationErrors.join('\n')}`);
  }

  return true;
};

// Check directory structure first
checkRouteDirectoryStructure();

// Load all routes with enhanced debugging
const allRoutes = loadAllRoutes();

// Validate loaded routes
Object.entries(allRoutes).forEach(([name, router]) => {
  try {
    validateRouteHandlers(router);
    logger.info(`✅ Validated routes for: ${name}`);
  } catch (error) {
    logger.error(`❌ Route validation failed for ${name}:`, error.message);
    // Log warning but don't exit - allow server to start
    logger.warn(`⚠️ Server will continue despite validation errors in ${name} routes`);
  }
});

// Extract individual routes from the loaded routes object
const mpesaRoutes = allRoutes.mpesa || null;
const propertyRoutes = allRoutes.property || null;
const authRoutes = allRoutes.auth || null;
const uploadRoutes = allRoutes.upload || null;
const userRoutes = allRoutes.user || null;
const adminRoutes = allRoutes.admin || null;
const maintenanceRoutes = allRoutes.maintenance || null;
const paymentRoutes = allRoutes.payment || null;
const transactionRoutes = allRoutes.transaction || null;
const tenantRoutes = allRoutes.tenant || null;
const leaseRoutes = allRoutes.lease || null;
const documentRoutes = allRoutes.document || null;
const notificationRoutes = allRoutes.notification || null;
const messageRoutes = allRoutes.message || null;
const vendorRoutes = allRoutes.vendor || null;
const analyticsRoutes = allRoutes.analytics || null;

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      timestamp: res.locals.currentTime
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        error: 'Invalid or expired token',
        timestamp: res.locals.currentTime
      });
    }
    req.user = user;
    next();
  });
};

// Optional authentication middleware (for routes that work with or without auth)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access token required',
        timestamp: res.locals.currentTime
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        timestamp: res.locals.currentTime
      });
    }

    next();
  };
};

// Database Connection with Retry
const connectWithRetry = () => {
  if (!process.env.MONGODB_URI) {
    logger.error('❌ MONGODB_URI environment variable is not set!');
    return;
  }

  mongoose.set('strictQuery', false);

  // Skip MongoDB connection in test environment (tests handle their own connection)
  if (process.env.NODE_ENV !== 'test') {
    logger.info('🔄 Attempting MongoDB connection...');

    mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    })
      .then(() => {
        logger.info('✅ Connected to MongoDB');
        // Create indexes if needed
        createIndexes();
      })
      .catch(err => {
        logger.error(`❌ MongoDB connection failed: ${err.message}`);
        logger.info('⏳ Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      });
  } else {
    logger.info('⏭️ Skipping MongoDB connection in test environment');
  }
};

// Database indexes creation and model initialization
const createIndexes = async () => {
  try {
    // Pre-load all models to ensure they're registered
    require('./models/user.model');
    require('./models/property.model');
    require('./models/transaction.model');
    require('./models/payment.model');
    require('./models/maintenance.model');
    require('./models/vendor.model');
    require('./models/lease.model');
    require('./models/config.model');
    require('./models/audit-log.model');
    require('./models/admin-role.model');
    require('./models/admin-user.model');
    require('./models/tenant.model');
    require('./models/property-approval.model');

    // Create indexes
    await mongoose.connection.db.collection('properties').createIndex({ location: '2dsphere' });
    await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.db.collection('payments').createIndex({ transactionId: 1 });
    await mongoose.connection.db.collection('maintenance').createIndex({ propertyId: 1 });
    await mongoose.connection.db.collection('transactions').createIndex({ createdAt: -1 });
    await mongoose.connection.db.collection('audits').createIndex({ timestamp: -1 });

    logger.info('✅ Database indexes created successfully');
    logger.info('✅ All models loaded successfully');
  } catch (error) {
    logger.error('❌ Error in database initialization:', error.message);
    throw error; // Rethrow to trigger connection retry
  }
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Cluster-aware request tracking middleware
if (cluster.isWorker && workerHealth) {
  app.use((req, res, next) => {
    const startTime = Date.now();

    // Track response completion
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      workerHealth.trackRequest(duration, res.statusCode >= 400);

      // Send health update to primary process
      if (process.send) {
        process.send({
          type: 'health_status',
          data: workerHealth.getHealthStatus()
        });
      }
    });

    next();
  });
}

// Worker-specific rate limiting
if (cluster.isWorker && workerRateLimiter) {
  app.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimit = workerRateLimiter.checkLimit(clientIP);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        reason: rateLimit.reason,
        retryAfter: rateLimit.resetIn
      });
    }

    // Add rate limit info to response headers
    res.set({
      'X-RateLimit-Limit': workerRateLimiter.maxRequestsPerIP,
      'X-RateLimit-Remaining': rateLimit.remaining.ip,
      'X-RateLimit-Reset': workerRateLimiter.lastReset + workerRateLimiter.windowMs
    });

    next();
  });
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and in test environment
    return req.path === '/health' || req.path === '/' || process.env.NODE_ENV === 'test';
  }
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  }
});

// Very strict rate limiting for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  },
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  }
});

// Validate security configuration on startup
validateSecurityConfig();

// Apply critical security middleware FIRST
app.use(httpsRedirect);
app.use(addRequestId);
app.use(securityHeaders);
app.use(requestSizeLimiter);
app.use(preventParameterPollution);

// Basic middleware with security limits
app.use(express.json(securityConfig.bodyParser.json));
app.use(express.urlencoded(securityConfig.bodyParser.urlencoded));
app.use(compression());

// Additional security middleware
app.use(detectSuspiciousActivity);
app.use(requestTiming);
app.use(auditLog);

// Data sanitization
app.use(mongoSanitize());
app.use(xss());

// Apply rate limiting to API routes
app.use('/api/', limiter);

// CORS Configuration
app.use(cors({
  origin: [
    '',
    'https://mokuavinnie.tech',
    'https://nyumbasync.co.ke',
    'https://app.nyumbasync.co.ke',
    'https://sandbox.safaricom.co.ke',
    ...(process.env.NODE_ENV === 'development' ? [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:10000',
      'http://127.0.0.1:10000'
    ] : [])
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Timezone Middleware
app.use((req, res, next) => {
  const now = new Date();
  res.locals.timezone = 'Africa/Nairobi';
  res.locals.currentTime = now.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour12: true,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  res.locals.requestTimestamp = now.getTime();
  next();
});

// Request Logging
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.user ? req.user.id : 'anonymous';
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip} - User: ${userId} - UA: ${userAgent}`);
  next();
});

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  res.set('X-Request-ID', req.requestId);
  next();
});

// Root Route
app.get('/', (req, res) => {
  logger.info('Root route accessed');
  res.set('Content-Type', 'application/json');
  res.status(200).json({
    status: 'running',
    service: 'NyumbaSync API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    documentation: '',
    endpoints: {
      auth: '/api/v1/auth',
      properties: '/api/v1/properties',
      mpesa: '/api/v1/mpesa',
      upload: '/api/v1/upload',
      health: '/health'
    }
  });
});

// Health check route
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    timestamp: res.locals.currentTime,
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.status(200).json({
    api: 'NyumbaSync API',
    version: '1.0.0',
    status: 'operational',
    timestamp: res.locals.currentTime,
    services: {
      database: mongoose.connection.readyState === 1 ? 'online' : 'offline',
      mpesa: 'online', // You can add actual service health checks here
      auth: 'online',
      fileUpload: 'online'
    }
  });
});

// Enhanced Route Registration with Debug Logging
const registerRoutes = () => {
  logger.info('\n🔗 Registering routes with Express app...');

  // Auth routes with rate limiting
  if (authRoutes) {
    try {
      app.use('/api/v1/auth/login', authLimiter);
      app.use('/api/v1/auth/register', authLimiter);
      app.use('/api/v1/auth/reset-password', passwordResetLimiter);
      app.use('/api/v1/auth', authRoutes);
      logger.info('✅ Auth routes registered with rate limiting at /api/v1/auth');
    } catch (err) {
      logger.error('❌ Failed to register auth routes:', err.message);
    }
  } else {
    logger.error('❌ Failed to register auth routes:');
  }

  // MFA routes with authentication
  try {
    const mfaRoutes = require('./routes/v1/mfa.routes');
    app.use('/api/v1/auth/mfa', mfaRoutes);
    logger.info('✅ MFA routes registered at /api/v1/auth/mfa');
    const biometricRoutes = require('./routes/v1/biometric.routes');
    app.use('/api/v1/auth/biometric', biometricRoutes);
    logger.info('✅ Biometric routes registered at /api/v1/auth/biometric');
  } catch (err) {
    logger.error('❌ Failed to register MFA routes:', err.message);
  }

  // User routes with authentication
  if (userRoutes) {
    try {
      app.use('/api/v1/users', authenticateToken, userRoutes);
      logger.info('✅ User routes registered with authentication at /api/v1/users');
    } catch (err) {
      logger.error('❌ Failed to register user routes:', err.message);
    }
  } else {
    logger.error('❌ Failed to register user routes:');
  }

  // M-Pesa routes with authentication
  if (mpesaRoutes) {
    try {
      app.use('/api/v1/mpesa', authenticateToken, mpesaRoutes);
      logger.info('✅ M-Pesa routes registered with authentication at /api/v1/mpesa');
    } catch (err) {
      logger.error('❌ Failed to register M-Pesa routes:', err.message);
    }
  } else {
    logger.warn('⚠️ M-Pesa routes not registered - route loading failed');
  }

  // Property routes with optional authentication
  if (propertyRoutes) {
    try {
      app.use('/api/v1/properties', optionalAuth, propertyRoutes);
      logger.info('✅ Property routes registered with optional authentication at /api/v1/properties');
    } catch (err) {
      logger.error('❌ Failed to register property routes:', err.message);
    }
  } else {
    logger.error('❌ Failed to register property routes:');
  }

  // Upload routes with authentication
  if (uploadRoutes) {
    try {
      app.use('/api/v1/upload', authenticateToken, uploadRoutes);
      logger.info('✅ Upload routes registered with authentication at /api/v1/upload');
    } catch (err) {
      logger.error('❌ Failed to register upload routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Upload routes not registered - route loading failed');
  }

  // Admin routes with authentication and authorization
  if (adminRoutes) {
    try {
      app.use('/api/v1/admin', authenticateToken, authorize('admin'), adminRoutes);
      logger.info('✅ Admin routes registered with authentication and authorization at /api/v1/admin');
    } catch (err) {
      logger.error('❌ Failed to register admin routes:', err.message);
    }
  } else {
    logger.error('❌ Failed to register admin routes:');
  }

  // Maintenance routes
  if (maintenanceRoutes) {
    try {
      app.use('/api/v1/maintenance', authenticateToken, maintenanceRoutes);
      logger.info('✅ Maintenance routes registered with authentication at /api/v1/maintenance');
    } catch (err) {
      logger.error('❌ Failed to register maintenance routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Maintenance routes not registered - route loading failed');
  }

  // Payment routes
  if (paymentRoutes) {
    try {
      app.use('/api/v1/payments', authenticateToken, paymentRoutes);
      logger.info('✅ Payment routes registered with authentication at /api/v1/payments');
    } catch (err) {
      logger.error('❌ Failed to register payment routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Payment routes not registered - route loading failed');
  }

  // Transaction routes
  if (transactionRoutes) {
    try {
      app.use('/api/v1/transactions', authenticateToken, transactionRoutes);
      logger.info('✅ Transaction routes registered with authentication at /api/v1/transactions');
    } catch (err) {
      logger.error('❌ Failed to register transaction routes:', err.message);
    }
  } else {
    logger.error('❌ Failed to register transaction routes:');
  }

  // Tenant routes
  if (tenantRoutes) {
    try {
      app.use('/api/v1/tenant', authenticateToken, tenantRoutes);
      logger.info('✅ Tenant routes registered with authentication at /api/v1/tenant');
    } catch (err) {
      logger.error('❌ Failed to register tenant routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Tenant routes not registered - route loading failed');
  }

  // Lease routes
  if (leaseRoutes) {
    try {
      app.use('/api/v1/leases', authenticateToken, leaseRoutes);
      logger.info('✅ Lease routes registered with authentication at /api/v1/leases');
    } catch (err) {
      logger.error('❌ Failed to register lease routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Lease routes not registered - route loading failed');
  }

  // Document routes
  if (documentRoutes) {
    try {
      app.use('/api/v1/documents', authenticateToken, documentRoutes);
      logger.info('✅ Document routes registered with authentication at /api/v1/documents');
    } catch (err) {
      logger.error('❌ Failed to register document routes:', err.message);
    }
  } else {
    logger.warn('⚠️ Document routes not registered - route loading failed');
  }

  // Notification routes
  if (notificationRoutes) {
    try {
      app.use('/public', express.static(publicDir, {
        maxAge: '1d',
        etag: true
      }));
      logger.info('✅ Static files served from /public');
    } else {
      logger.warn('⚠️ Public directory not found, static files not served');
    }

    // Serve uploaded files
    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
      maxAge: '7d',
      etag: true
    })); */

    // API Documentation (in development)
    if (process.env.NODE_ENV === 'development') {
      app.get('/api/docs', (req, res) => {
        res.json({
          title: 'NyumbaSync API Documentation',
          version: '1.0.0',
          description: 'Property management system API',
          endpoints: {
            authentication: {
              register: 'POST /api/v1/auth/register',
              login: 'POST /api/v1/auth/login',
              logout: 'POST /api/v1/auth/logout',
              refreshToken: 'POST /api/v1/auth/refresh',
              resetPassword: 'POST /api/v1/auth/reset-password'
            },
            properties: {
              getAll: 'GET /api/v1/properties',
              getById: 'GET /api/v1/properties/:id',
              create: 'POST /api/v1/properties',
              update: 'PUT /api/v1/properties/:id',
              delete: 'DELETE /api/v1/properties/:id'
            },
            mpesa: {
              initiatePayment: 'POST /api/v1/mpesa/payment',
              callback: 'POST /api/v1/mpesa/callback',
              status: 'GET /api/v1/mpesa/status/:id'
            },
            upload: {
              single: 'POST /api/v1/upload',
              multiple: 'POST /api/v1/upload/multiple'
            }
          }
        });
      });
    }

    // 404 Handler for unmatched routes
    app.use('*', (req, res) => {
      logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        suggestedRoutes: [
          '/api/v1/auth',
          '/api/v1/properties',
          '/api/v1/mpesa',
          '/api/v1/upload',
          '/health',
          '/api/status'
        ]
      });
    });

    // =============================================
    // GLOBAL ERROR HANDLER MIDDLEWARE
    // =============================================
    app.use((err, req, res, next) => {
      // Log the error with Winston logger
      logger.error('Global error handler:', {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip,
        user: req.user ? req.user.id : 'anonymous'
      });

      // Handle specific error types
      let statusCode = 500;
      let message = 'Internal Server Error';
      let details = null;

      if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
        details = Object.values(err.errors).map(e => e.message);
      } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
      } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
      } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Resource Not Found';
      } else if (err.name === 'MongoError') {
        // Handle specific MongoDB errors
        if (err.code === 11000) {
          statusCode = 409;
          message = 'Duplicate Key Error';
          const key = Object.keys(err.keyValue)[0];
          details = `${key} already exists`;
        }
      } else if (err.name === 'CastError') {
        statusCode = 400;
        message = `Invalid ${err.path}: ${err.value}`;
      } else if (err.code === 11000) {
        statusCode = 400;
        const field = Object.keys(err.keyValue)[0];
        message = `Duplicate ${field} value`;
      } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
      } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
      } else if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = 'File size too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          message = 'Too many files';
        }
      }

      // Handle M-Pesa specific errors
      if (err.isMpesaError) {
        return res.status(503).json({
          error: 'M-Pesa service temporarily unavailable',
          action: 'Please try again later',
          contact: '0700NYUMBA',
          timestamp: res.locals.currentTime,
          requestId: req.requestId
        });
      }

      // Format the error response
      const errorResponse = {
        error: message,
        timestamp: res.locals.currentTime || new Date().toISOString(),
        path: req.originalUrl,
        requestId: req.requestId,
        ...(details && { details }),
        ...(process.env.NODE_ENV === 'development' && {
          stack: err.stack
        })
      };

      // Send the error response
      res.status(statusCode).json(errorResponse);
    });

    // Database connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('✅ Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`❌ Mongoose connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ Mongoose disconnected from MongoDB');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('✅ Mongoose reconnected to MongoDB');
    });

    // Initialize Database Connection
    connectWithRetry();

    // Process monitoring (log memory usage every 5 minutes)
    setInterval(() => {
      const memUsage = process.memoryUsage();
      logger.info(`📊 Memory usage: ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS, ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB Heap`);
    }, 300000);

    // Validate middleware stack before starting server
    const validateMiddlewareStack = () => {
      const requiredMiddleware = [
        'helmet',
        'compression',
        'cors',
        'express.json',
        'express.urlencoded',
        'mongoSanitize',
        'xss'
      ];

      const registeredMiddleware = app._router.stack
        .filter(layer => layer.name !== '<anonymous>')
        .map(layer => layer.name);

      const missingMiddleware = requiredMiddleware.filter(
        middleware => !registeredMiddleware.includes(middleware)
      );

      if (missingMiddleware.length > 0) {
        throw new Error(`Missing required middleware: ${missingMiddleware.join(', ')}`);
      }

      server.close(async () => {
        logger.info('HTTP server closed');

        // Close database connection
        try {
          await mongoose.connection.close();
          logger.info('Database connection closed');
        } catch (err) {
          logger.error('Error closing database connection:', err);
        }

        // Cleanup cluster resources
        if (cluster.isWorker) {
          if (workerHealth) {
            // Send final health status to primary
            process.send({
              type: 'health_status',
              data: { ...await workerHealth.getHealthStatus(), shutdownInitiated: true }
            });
          }
        }

        // Final cleanup
        logger.info('Cleanup completed');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, process.env.GRACEFUL_SHUTDOWN_TIMEOUT || 30000);
    };

    // Setup signal handlers
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, () => gracefulShutdown(signal));
    });

    process.on('uncaughtException', (err) => {
      logger.error('❌ Uncaught Exception:', err);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit for unhandled rejections, just log them
    });

    // Export for testing
    module.exports = { app, server, authenticateToken, authorize, createRouterFromConfig };