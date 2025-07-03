require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { log } = require('./utils/logger');
const mpesaRoutes = require('./routes/v1/mpesa.routes');
const propertyRoutes = require('./routes/v1/property.routes');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// 1. Database Connection with Retry Logic (For Kenya's Unstable Networks)
const connectWithRetry = () => {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // 5s timeout for M-Pesa transactions
  })
  .then(() => log('Connected to MongoDB', 'success'))
  .catch(err => {
    log(`MongoDB connection failed: ${err.message}`, 'error');
    setTimeout(connectWithRetry, 5000); // Retry every 5s
  });
};
connectWithRetry();

// 2. Middleware Configuration
app.use(cors({
  origin: [
    'https://nyumbasync.co.ke', 
    'http://localhost:3000', // For local dev
    'https://app.nyumbasync.co.ke'
  ],
 credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Timezone Middleware (East Africa Time)
app.use((req, res, next) => {
  res.locals.timezone = 'Africa/Nairobi';
  next();
});

// 4. API Routes (Versioned)
app.use('/api/v1/mpesa', mpesaRoutes); // M-Pesa STK Push/Callbacks
app.use('/api/v1/properties', propertyRoutes); // Property listings

// 5. Static Files (For M-Pesa Callback URLs)
app.use('/public', express.static(path.join(__dirname, 'public')));

// 6. Error Handling (Kenya-specific)
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Samahani, kuna tatuko kwenye server';

  // Special handling for M-Pesa API errors
  if (err.isMpesaError) {
    log(`M-Pesa Error: ${err.details}`, 'error');
    return res.status(503).json({
      error: 'Huduma ya M-Pesa haipatikani kwa sasa. Tafadhali jaribu tena baadaye.'
    });
  }

  res.status(statusCode).json({ error: message });
});

// 7. Server Startup
app.listen(PORT, () => {
  log(`Server running on port ${PORT} (EAT Timezone)`, 'success');
  log(`M-Pesa Environment: ${process.env.MPESA_ENV}`, 'info');
});

// Export for testing
module.exports = app;
