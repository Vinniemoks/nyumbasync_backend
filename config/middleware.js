const jwt = require('jsonwebtoken');
const { kenyaPhoneValidator } = require('../utils/kenyanValidators');
const logger = require('../utils/logger');

// Kenyan phone number authentication
const authenticate = (req, res, next) => {
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized - Kenyan phone verification required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Additional Kenyan phone validation
    if (!kenyaPhoneValidator(decoded.phone)) {
      throw new Error('Invalid Kenyan phone number in token');
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    logger.error(`Auth failed: ${err.message}`);
    res.status(401).json({ 
      error: 'Session expired. Please login again' 
    });
  }
};

// Nairobi location validation
const validateNairobiLocation = (req, res, next) => {
  if (req.body.location) {
    const [longitude, latitude] = req.body.location.coordinates;
    
    // Rough Nairobi bounding box
    if (
      latitude < -1.55 || latitude > -1.10 ||
      longitude < 36.65 || longitude > 37.05
    ) {
      return res.status(400).json({
        error: 'Property must be within Nairobi County boundaries'
      });
    }
  }
  next();
};

// Kenyan rent increase validation
const validateRentIncrease = (req, res, next) => {
  if (req.body.rent) {
    const property = req.property;
    const newRent = req.body.rent;
    
    if (newRent > property.rent * 1.07) {
      return res.status(400).json({
        error: 'Rent increase exceeds 7% annual cap per Kenyan law'
      });
    }
  }
  next();
};

module.exports = {
  authenticate,
  validateNairobiLocation,
  validateRentIncrease,
  requestLogger: (req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
  }
};
