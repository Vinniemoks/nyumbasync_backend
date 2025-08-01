require('dotenv').config(); // Load environment variables first
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { expressjwt: jwt } = require('express-jwt');
const logger = require('./utils/logger');

// Initialize Express
const app = express();

// ========================
// 1. SECURITY MIDDLEWARE
// ========================
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

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

module.exports = app;