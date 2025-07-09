require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');

const app = express();
const PORT = process.env.PORT || 10000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Winston Logger Configuration
const logger = createLogger({
  level: 'info',
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

// Try to import routes with error handling
let mpesaRoutes, propertyRoutes, authRoutes;

try {
  mpesaRoutes = require('./routes/v1/mpesa.routes');
  logger.info('✅ M-Pesa routes loaded');
} catch (err) {
  logger.warn('⚠️ M-Pesa routes not found, skipping...', err.message);
}

try {
  propertyRoutes = require('./routes/v1/property.routes');
  logger.info('✅ Property routes loaded');
} catch (err) {
  logger.warn('⚠️ Property routes not found, skipping...', err.message);
}

try {
  authRoutes = require('./routes/v1/auth.routes');
  logger.info('✅ Auth routes loaded');
} catch (err) {
  logger.warn('⚠️ Auth routes not found, skipping...', err.message);
}

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
    socketTimeoutMS: 30000
  })
    .then(() => logger.info('✅ Connected to MongoDB'))
    .catch(err => {
      logger.error(`❌ MongoDB connection failed: ${err.message}`);
      logger.info('⏳ Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

// Basic middleware first
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS Configuration
app.use(cors({
  origin: [
    'https://mokuavinnie.tech',
    'https://nyumbasync.co.ke',
    'http://localhost:3000',
    'https://app.nyumbasync.co.ke',
    'https://sandbox.safaricom.co.ke'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
  logger.info(`${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Root Route - This should be the FIRST route defined
app.get('/', (req, res) => {
  logger.info('🏠 Root route accessed');
  
  try {
    const response = {
      status: '🟢 Running',
      service: 'NyumbaSync Backend API',
      version: '1.0.0',
      time: res.locals.currentTime,
      environment: process.env.NODE_ENV || 'development',
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      commit: process.env.RENDER_GIT_COMMIT || 'unknown',
      branch: process.env.RENDER_GIT_BRANCH || 'unknown',
      port: PORT,
      uptime: process.uptime()
    };
    
    logger.info('✅ Root route response sent');
    res.status(200).json(response);
  } catch (error) {
    logger.error('❌ Root route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: res.locals.currentTime
    });
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: res.locals.currentTime,
    uptime: process.uptime()
  });
});

// API Routes (only if they exist)
if (authRoutes) {
  app.use('/api/v1/auth', authRoutes);
  logger.info('✅ Auth routes registered');
}

if (mpesaRoutes) {
  app.use('/api/v1/mpesa', mpesaRoutes);
  logger.info('✅ M-Pesa routes registered');
}

if (propertyRoutes) {
  app.use('/api/v1/properties', propertyRoutes);
  logger.info('✅ Property routes registered');
}

// Static Files
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use('/public', express.static(publicDir));
  logger.info('✅ Static files served from /public');
} else {
  logger.warn('⚠️ Public directory not found, static files not served');
}

// 404 Handler
app.use('*', (req, res) => {
  logger.warn(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: res.locals.currentTime
  });
});

// Error Handling
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    message: `[${res.locals.currentTime}] ${message}`,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  if (err.isMpesaError) {
    return res.status(503).json({
      error: 'M-Pesa service unavailable',
      action: 'Please try again later',
      contact: '0700NYUMBA',
      timestamp: res.locals.currentTime
    });
  }

  res.status(statusCode).json({
    error: message,
    timestamp: res.locals.currentTime,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize Database Connection
connectWithRetry();

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
  logger.info(`🔗 Commit: ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
  logger.info(`🌿 Branch: ${process.env.RENDER_GIT_BRANCH || 'unknown'}`);
  logger.info(`🔗 Server running at: http://0.0.0.0:${PORT}`);
});

// Graceful Shutdown
const shutdown = (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server };