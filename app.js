require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { expressjwt: jwt } = require('express-jwt');
const compression = require('compression');

// Import middlewares
const {
  helmet: helmetConfig,
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
// 1. SECURITY MIDDLEWARE
// ========================
app.use(helmetConfig);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400
}));

// ========================
// 2. PERFORMANCE
// ========================
app.use(compression());

// ========================
// 3. SESSION (Redis optional)
// ========================
try {
  const session = require('express-session');
  const redisClient = require('./config/redis');
  let store;

  if (redisClient) {
    try {
      const RedisStore = require('connect-redis').default || require('connect-redis')(session);
      store = new RedisStore({ client: redisClient });
    } catch (e) {
      logger.warn('connect-redis not available, using memory session store');
    }
  }

  app.use(session({
    store,
    secret: process.env.SESSION_SECRET || 'nyumbasync-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_DURATION) || 24 * 60 * 60 * 1000
    }
  }));
} catch (e) {
  logger.warn('Session middleware not available:', e.message);
}

// ========================
// 4. LOGGING
// ========================
app.use(morgan(process.env.LOG_FORMAT || 'combined', {
  stream: { write: message => logger.info(message.trim()) }
}));
app.use(requestTracker);
app.use(performanceMonitor);
app.use(resourceMonitor);
app.use(cacheMonitor);
app.use(queryMonitor);

// ========================
// 5. REQUEST PARSING
// ========================
app.use(express.json({ limit: process.env.MAX_PAYLOAD_SIZE || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_PAYLOAD_SIZE || '50mb' }));

// ========================
// 6. RATE LIMITING
// ========================
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300
});
app.use(limiter);

// ========================
// 7. AUTHENTICATION (JWT)
// ========================
app.use(
  jwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    credentialsRequired: false
  }).unless({
    path: [
      '/api/v1/auth/login',
      '/api/v1/auth/signup',
      '/api/v1/auth/register',
      '/api/v1/auth/verify',
      '/api/v1/auth/forgot-password',
      '/api/v1/mpesa/callback',
      '/health'
    ]
  })
);

// ========================
// 8. KENYAN PHONE FORMATTING
// ========================
app.use((req, res, next) => {
  if (req.body && req.body.phone) {
    req.body.phone = req.body.phone.replace(/^0/, '254');
  }
  next();
});

// ========================
// 9. ROUTES
// ========================

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'active',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API Routes (centralized)
app.use('/api', routes);

// ========================
// 10. ERROR HANDLING
// ========================

// Error Monitoring
app.use(errorMonitor);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  errorTracker.captureError(err);
  logger.error('Unhandled Error:', err);

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (err.message && err.message.includes('MPESA_')) {
    return res.status(503).json({
      error: 'M-Pesa service unavailable'
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ========================
// 11. DATABASE CONNECTION
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
  mongoose.connection.close(false, () => {
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
});

module.exports = app;
