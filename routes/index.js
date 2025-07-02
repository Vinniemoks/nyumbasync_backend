const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware');
const v1Routes = require('./v1');

// Kenyan timezone middleware
router.use((req, res, next) => {
  req.kenyaTime = new Date().toLocaleString('en-KE', { 
    timeZone: 'Africa/Nairobi' 
  });
  next();
});

// API versions
router.use('/v1', v1Routes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'active',
    region: 'Nairobi',
    time: req.kenyaTime
  });
});

// Fallback for USSD
router.post('/ussd', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
    CON Welcome to NyumbaSync
    1. Pay Rent
    2. Report Issue
    3. Contact Landlord
  `);
});

module.exports = router;
