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
const { createLogger, format, transports } = require('winston');

const app = express();
const PORT = process.env.PORT || 10000;

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

// Enhanced Route Loader Function with Debug Logging
const loadRoute = (routeName) => {
  const routePath = path.join(__dirname, 'routes', 'v1', `${routeName}.routes.js`);
  
  logger.info(`🔄 Attempting to load ${routeName} routes from: ${routePath}`);
  
  try {
    // Check if file exists first
    if (!fs.existsSync(routePath)) {
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
    const route = require(routePath);
    
    // Validate the loaded route
    if (!route) {
      logger.error(`❌ ${routeName} route file exists but exports null/undefined`);
      return null;
    }
    
    if (typeof route !== 'function' && typeof route !== 'object') {
      logger.error(`❌ ${routeName} route exports invalid type: ${typeof route}. Expected function or router object.`);
      return null;
    }
    
    // Check if it's an Express router
    if (route && route.stack && Array.isArray(route.stack)) {
      logger.info(`✅ ${routeName} routes loaded successfully with ${route.stack.length} route(s)`);
      
      // Log individual routes in debug mode
      if (process.env.LOG_LEVEL === 'debug') {
        route.stack.forEach((layer, index) => {
          const method = layer.route ? 
            Object.keys(layer.route.methods).join(', ').toUpperCase() : 
            'MIDDLEWARE';
          const path = layer.route ? layer.route.path : layer.regexp.source;
          logger.debug(`  📍 Route ${index + 1}: ${method} ${path}`);
        });
      }
    } else if (typeof route === 'function') {
      logger.info(`✅ ${routeName} middleware function loaded successfully`);
    } else {
      logger.warn(`⚠️ ${routeName} loaded but may not be a valid Express router or middleware`);
    }
    
    return route;
    
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
const loadAllRoutes = () => {
  logger.info('🚀 Starting route loading process...');
  
  const routesToLoad = [
    'mpesa',
    'property', 
    'auth',
    'upload',
    'user',
    'admin',
    'maintenance',
    'payment',
    'transaction'
  ];
  
  const loadedRoutes = {};
  const failedRoutes = [];
  const routeStats = {
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

// Check directory structure first
checkRouteDirectoryStructure();

// Load all routes with enhanced debugging
const allRoutes = loadAllRoutes();

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

// File upload configuration
/* const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
}); */

/* const upload = multer({
  storage: storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
}); */

// Database Connection with Retry
const connectWithRetry = () => {
  if (!process.env.MONGODB_URI) {
    logger.error('❌ MONGODB_URI environment variable is not set!');
    return;
  }

  mongoose.set('strictQuery', false);
  logger.info('🔄 Attempting MongoDB connection...');

  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    maxPoolSize: 10,
    bufferMaxEntries: 0,
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
};

// Database indexes creation
const createIndexes = async () => {
  try {
    // Add your collection indexes here
    // Example:
    // await mongoose.connection.db.collection('properties').createIndex({ location: '2dsphere' });
    // await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { unique: true });
    logger.info('✅ Database indexes created successfully');
  } catch (error) {
    logger.error('❌ Error creating database indexes:', error.message);
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
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
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
  legacyHeaders: false
});

// Very strict rate limiting for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  }
});

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Data sanitization
app.use(mongoSanitize());
app.use(xss());

// Apply rate limiting to API routes
app.use('/api/', limiter);

// CORS Configuration
app.use(cors({
  origin: [
    'https://nyumbasync-backend.onrender.com',
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

// Render Proxy Middleware
app.use((req, res, next) => {
  if (process.env.RENDER) {
    res.set('X-Render-Host', req.hostname);
    res.set('X-Render-Instance', process.env.RENDER_INSTANCE_ID || 'unknown');
  }
  next();
});

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
    renderInstance: process.env.RENDER_INSTANCE_ID || 'local',
    uptime: process.uptime(),
    documentation: 'https://docs.nyumbasync.com',
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

/* // File upload endpoint
app.post('/api/v1/upload', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        timestamp: res.locals.currentTime 
      });
    }
    
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.status(200).json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl
      },
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('File upload error:', error);
    res.status(500).json({
      error: 'File upload failed',
      timestamp: res.locals.currentTime
    });
  }
}); */

/* // Multiple file upload endpoint
app.post('/api/v1/upload/multiple', authenticateToken, upload.array('images', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        error: 'No files uploaded',
        timestamp: res.locals.currentTime 
      });
    }
    
    const files = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
    }));
    
    res.status(200).json({
      message: 'Files uploaded successfully',
      files,
      count: files.length,
      timestamp: res.locals.currentTime
    });
  } catch (error) {
    logger.error('Multiple file upload error:', error);
    res.status(500).json({
      error: 'File upload failed',
      timestamp: res.locals.currentTime
    });
  }
}); */

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
    logger.warn('⚠️ Auth routes not registered - route loading failed');
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
    logger.warn('⚠️ User routes not registered - route loading failed');
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
    logger.warn('⚠️ Property routes not registered - route loading failed');
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
    logger.warn('⚠️ Admin routes not registered - route loading failed');
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
    logger.warn('⚠️ Transaction routes not registered - route loading failed');
  }

  logger.info('🎯 Route registration process completed\n');
};

// Call the route registration function
registerRoutes();

// Admin routes (if you have admin functionality)
app.get('/api/v1/admin/stats', authenticateToken, authorize('admin'), (req, res) => {
  res.json({
    message: 'Admin statistics',
    timestamp: res.locals.currentTime,
    // Add your admin stats here
  });
});

// Enhanced Debug Route for Development
if (process.env.NODE_ENV === 'development') {
  app.get('/api/debug/routes', (req, res) => {
    const routeStatus = {
      system: 'NyumbaSync API',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      routeDirectory: path.join(__dirname, 'routes', 'v1'),
      loadedRoutes: {
        auth: authRoutes ? 'loaded' : 'failed',
        mpesa: mpesaRoutes ? 'loaded' : 'failed',
        property: propertyRoutes ? 'loaded' : 'failed',
        upload: uploadRoutes ? 'loaded' : 'failed',
        payment: paymentRoutes ? 'loaded' : 'failed',
        user: userRoutes ? 'loaded' : 'failed',
        admin: adminRoutes ? 'loaded' : 'failed',
        maintenance: maintenanceRoutes ? 'loaded' : 'failed',
        transaction: transactionRoutes ? 'loaded' : 'failed'
      },
      registeredEndpoints: [],
      recommendations: []
    };

    // Check which routes are actually registered
    const loadedCount = Object.values(routeStatus.loadedRoutes).filter(status => status === 'loaded').length;
    const totalCount = Object.keys(routeStatus.loadedRoutes).length;
    
    routeStatus.summary = {
      total: totalCount,
      loaded: loadedCount,
      failed: totalCount - loadedCount,
      successRate: `${Math.round((loadedCount / totalCount) * 100)}%`
    };

    // Add recommendations based on failures
    const failedRoutes = Object.entries(routeStatus.loadedRoutes)
      .filter(([, status]) => status === 'failed')
      .map(([route]) => route);

    if (failedRoutes.length > 0) {
      routeStatus.recommendations.push(
        `Check if these route files exist: ${failedRoutes.map(r => `routes/v1/${r}.routes.js`).join(', ')}`
      );
      routeStatus.recommendations.push('Verify file permissions and syntax in failed route files');
      routeStatus.recommendations.push('Check server logs for detailed error messages');
    }

    // Try to read directory contents for additional info
    try {
      const v1Dir = path.join(__dirname, 'routes', 'v1');
      const files = fs.existsSync(v1Dir) ? fs.readdirSync(v1Dir) : [];
      routeStatus.filesInDirectory = files;
      routeStatus.routeFiles = files.filter(f => f.endsWith('.routes.js'));
    } catch (err) {
      routeStatus.directoryError = err.message;
    }

    res.json(routeStatus);
  });
  
  logger.info('✅ Enhanced route debugger available at /api/debug/routes');
}

// Static Files
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
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
}));

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

// 404 Handler
app.use('*', (req, res) => {
  logger.warn(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: res.locals.currentTime,
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

// Enhanced Error Handling
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 400
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

  // Log error details
  logger.error({
    message: `[${res.locals.currentTime}] ${message}`,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId,
    userId: req.user ? req.user.id : 'anonymous',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

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

  // Send error response
  res.status(statusCode).json({
    error: message,
    timestamp: res.locals.currentTime,
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
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

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  const currentTime = new Date().toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour12: true,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  logger.info(`🚀 Server successfully started on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`💳 M-Pesa Mode: ${process.env.MPESA_ENV || 'sandbox'}`);
  logger.info(`⏰ Current EAT: ${currentTime}`);
  logger.info(`📁 Logs directory: ${path.join(__dirname, 'logs')}`);
  logger.info(`📤 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  logger.info(`🔗 Commit: ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
  logger.info(`🌿 Branch: ${process.env.RENDER_GIT_BRANCH || 'unknown'}`);
  logger.info(`🔗 Server running at: http://0.0.0.0:${PORT}`);
  logger.info(`📖 API Documentation: http://0.0.0.0:${PORT}/api/docs`);
  logger.info(`🏥 Health Check: http://0.0.0.0:${PORT}/health`);
}).on('error', (err) => {
  logger.error('❌ Server failed to start:', err);
  process.exit(1);
});

// Graceful Shutdown
const shutdown = (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    logger.info('✅ HTTP server closed');
    
    mongoose.connection.close(false, () => {
      logger.info('✅ MongoDB connection closed');
      
      // Close any other resources here
      process.exit(0);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Process event handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit for unhandled rejections, just log them
});

// Export for testing
module.exports = { app, server, authenticateToken, authorize };