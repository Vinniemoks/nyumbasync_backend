require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { expressjwt: jwt } = require('express-jwt');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const compression = require('compression');

// Import middlewares
const { 
  helmet: helmetConfig,
  csrf,
  session: sessionConfig,
  errorHandler
} = require('./middlewares/enhanced-security.middleware');
const {
  requestTracker,
  performanceMonitor,
  resourceMonitor,
  cacheMonitor,
  queryMonitor,
  errorMonitor
} = require('./middlewares/monitoring.middleware');
const { validateRequest } = require('./middlewares/validation');
const { upload } = require('./middlewares/upload.middleware');

// Import routes
const routes = require('./routes');

// Import services
const backupService = require('./services/backup.service');
const searchService = require('./services/search.service');
const notificationService = require('./services/notification.service');
const cacheService = require('./services/cache.service');

// Import utils
const logger = require('./utils/logger');
const performanceMetrics = require('./utils/performanceMetrics');
const errorTracker = require('./utils/errorTracker');

// Initialize Express
const app = express();

// ========================
// 1. PRE-ROUTE MIDDLEWARE
// ========================

// Security
app.use(helmetConfig);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400
}));

// Performance
app.use(compression());
app.use(express.json({ limit: process.env.MAX_PAYLOAD_SIZE || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_PAYLOAD_SIZE || '50mb' }));

// Session Management
const redisClient = require('./config/redis');
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_DURATION) || 24 * 60 * 60 * 1000
  }
}));

// Monitoring & Logging
app.use(morgan(process.env.LOG_FORMAT || 'combined', {
  stream: { write: message => logger.info(message.trim()) }
}));
app.use(requestTracker);
app.use(performanceMonitor);
app.use(resourceMonitor);
app.use(cacheMonitor);
app.use(queryMonitor);

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});
app.use(limiter);

// Rate limiting (for Kenyan traffic patterns)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

// ========================
// 2. LOGGING (Morgan with shared logger)
// ========================
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// ========================
// 3. REQUEST PARSING
// ========================
app.use(express.json({ limit: '10kb' })); // JSON payloads
app.use(express.urlencoded({ extended: true })); // Form data

// ========================
// 4. AUTHENTICATION (JWT)
// ========================
app.use(
  jwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    credentialsRequired: false // Allow public routes
  }).unless({
    path: [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/verify',
      '/api/v1/mpesa/callback' // M-Pesa IPNs are public
    ]
  })
);

// ========================
// 5. ROUTES
// ========================
// Kenyan phone validation middleware
app.use((req, res, next) => {
  if (req.body && req.body.phone) { // Added check for req.body
    console.log('Phone before formatting middleware:', req.body.phone); // Added console log
    req.body.phone = req.body.phone.replace(/^0/, '254'); // Convert 07... to 2547...
    console.log('Phone after formatting middleware:', req.body.phone); // Added console log
  }
  next();
});

// API Routes
app.use('/api/v1/auth', require('./routes/v1/auth.routes'));
app.use('/api/v1/mpesa', require('./routes/v1/mpesa.routes'));
app.use('/api/v1/rent', require('./routes/v1/payment.routes'));

// ========================
// 6. ERROR HANDLING
// ========================
// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Hakuna kitu hapa! (Nothing here!)',
    swahiliHint: 'Unaenda wapi? (Where do you go?)'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack); // Use shared logger
  
  // M-Pesa API errors
  if (err.message.includes('MPESA_')) {
    return res.status(503).json({ 
      error: 'Huduma ya M-Pesa haipatikani kwa sasa',
      english: 'M-Pesa service unavailable'
    });
  }

  // JWT errors
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Hakiki hati yako!' }); // "Verify your token!"
  }

  res.status(500).json({ error: 'Kuna kitu kimekosekana!' }); // "Something went wrong!"
});

// ========================
// 2. ROUTES
// ========================

// API Routes
app.use('/api', routes);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'active',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ========================
// 3. ERROR HANDLING
// ========================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Error Monitoring
app.use(errorMonitor);

// Global Error Handler
app.use((err, req, res, next) => {
  errorTracker.captureError(err);
  logger.error('Unhandled Error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ========================
// 4. DATABASE CONNECTION
// ========================

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  logger.info('Connected to MongoDB');
}).catch(err => {
  logger.error('MongoDB Connection Error:', err);
  process.exit(1);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connection
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;