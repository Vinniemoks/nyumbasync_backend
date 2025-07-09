require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const mpesaRoutes = require('./routes/v1/mpesa.routes');
const propertyRoutes = require('./routes/v1/property.routes');
const authRoutes = require('./routes/v1/auth.routes');

const app = express();
const PORT = process.env.PORT || 10000;

// Winston Logger
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

// Database Connection with Retry
const connectWithRetry = () => {
  mongoose.set('strictQuery', false);

  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000
  })
    .then(() => logger.info('Connected to MongoDB'))
    .catch(err => {
      logger.error(`MongoDB connection failed: ${err.message}`);
      logger.info('Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// Middleware
app.use(cors({
  origin: [
    'https://mokuavinnie.tech/',
    'https://nyumbasync.co.ke',
    'http://localhost:3000',
    'https://app.nyumbasync.co.ke',
    'https://sandbox.safaricom.co.ke'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Log Requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Default root route to fix "Cannot GET /"
app.get('/', (req, res) => {
  res.send('🟢 Backend API is running. Welcome to NyumbaSync!');
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/mpesa', mpesaRoutes);
app.use('/api/v1/properties', propertyRoutes);

// Static Files
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mpesa')) {
      res.set('Cache-Control', 'no-store');
    } else if (filePath.match(/\.(jpg|jpeg|png|gif|ico|css|js)$/)) {
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.get('/', (req, res) => {
  res.status(200).send('NyumbaSync Backend is running 🚀');
});

// Error Handling
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Samahani, kuna tatuko kwenye server';

  logger.error({
    message: `[${res.locals.currentTime}] ${message}`,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.id
  });

  if (err.isMpesaError) {
    return res.status(503).json({
      error: 'Huduma ya M-Pesa haipatikani kwa sasa',
      action: 'Tafadhali jaribu tena baadaye',
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

  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`💳 M-Pesa Mode: ${process.env.MPESA_ENV || 'sandbox'}`);
  logger.info(`⏰ Current EAT: ${currentTime}`);
  logger.info(`📁 Logs directory: ${path.join(__dirname, 'logs')}`);
});

// Shutdown Cleanup
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
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
