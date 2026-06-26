const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/user.model');
const winston = require('winston');
require('dotenv').config();

const router = express.Router();

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/auth.log' })
  ]
});

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: {
    error: 'Too many login attempts from this IP',
    retryAfter: 15 * 60 * 1000,
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Please wait 15 minutes before trying again',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString()
    });
  }
});

// Input validation middleware
const validateLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or phone is required')
    .custom((value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!emailRegex.test(value) && !phoneRegex.test(value)) {
        throw new Error('Please provide a valid email or phone number');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .notEmpty()
    .withMessage('Password is required'),
  body('remember')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean value')
];


// Helper function to determine if identifier is email or phone
const determineIdentifierType = (identifier) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(identifier) ? 'email' : 'phone';
};

// Helper function to generate JWT token
const generateToken = (user, remember = false) => {
  const payload = {
    userId: user._id,
    email: user.email,
    phone: user.phone,
    role: user.role || 'user',
    verified: user.verified || false
  };

  const options = {
    expiresIn: remember ? '30d' : '24h',
    issuer: 'NyumbaSync',
    audience: 'nyumbasync-users'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

// Helper function to generate refresh token
const generateRefreshToken = (user) => {
  const payload = {
    userId: user._id,
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// Login endpoint
router.post('/login', loginLimiter, validateLogin, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Login validation failed', { 
        errors: errors.array(), 
        ip: req.ip 
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input and try again',
        details: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { identifier, password, remember = false } = req.body;
    const identifierType = determineIdentifierType(identifier);

    // Log login attempt
    logger.info(`Login attempt for ${identifierType}: ${identifier}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Find user by email or phone
    const query = identifierType === 'email' 
      ? { email: identifier.toLowerCase() }
      : { phone: identifier };

    const user = await User.findOne(query).select('+password');

    if (!user) {
      logger.warn(`Login failed - user not found: ${identifier}`, { ip: req.ip });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email/phone or password is incorrect',
        timestamp: new Date().toISOString()
      });
    }

    // Check if user account is active
    if (user.status === 'suspended' || user.status === 'banned') {
      logger.warn(`Login attempt for suspended/banned user: ${identifier}`, { ip: req.ip });
      
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended. Please contact support.',
        contact: '0700NYUMBA',
        timestamp: new Date().toISOString()
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      logger.warn(`Login failed - invalid password for: ${identifier}`, { ip: req.ip });
      
      // Increment failed login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      user.lastFailedLogin = new Date();
      
      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.status = 'locked';
        user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        await user.save();
        
        logger.warn(`Account locked due to multiple failed attempts: ${identifier}`);
        
        return res.status(423).json({
          error: 'Account locked',
          message: 'Account locked due to multiple failed login attempts. Please try again in 30 minutes.',
          lockedUntil: user.lockedUntil,
          timestamp: new Date().toISOString()
        });
      }
      
      await user.save();
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email/phone or password is incorrect',
        attemptsRemaining: 5 - user.loginAttempts,
        timestamp: new Date().toISOString()
      });
    }

    // Check if account is locked
    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > new Date()) {
      logger.warn(`Login attempt for locked account: ${identifier}`, { ip: req.ip });
      
      return res.status(423).json({
        error: 'Account locked',
        message: 'Account is temporarily locked. Please try again later.',
        lockedUntil: user.lockedUntil,
        timestamp: new Date().toISOString()
      });
    }

    // Successful login - reset failed attempts and unlock account
    user.loginAttempts = 0;
    user.lastFailedLogin = null;
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    
    if (user.status === 'locked') {
      user.status = 'active';
      user.lockedUntil = null;
    }

    // Update user's last login info
    user.lastLoginIP = req.ip;
    user.lastLoginUserAgent = req.get('User-Agent');
    
    await user.save();

    // Generate tokens
    const accessToken = generateToken(user, remember);
    const refreshToken = generateRefreshToken(user);

    // Prepare user data for response (exclude sensitive info)
    const userData = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role || 'user',
      verified: user.verified || false,
      profilePicture: user.profilePicture,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      preferences: user.preferences || {},
      createdAt: user.createdAt
    };

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Log successful login
    logger.info(`Successful login for: ${identifier}`, {
      userId: user._id,
      ip: req.ip,
      remember,
      timestamp: new Date().toISOString()
    });

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      token: accessToken,
      tokenType: 'Bearer',
      expiresIn: remember ? '30d' : '24h',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Login error:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again later.',
      timestamp: new Date().toISOString()
    });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    // Clear refresh token cookie
    res.clearCookie('refreshToken');
    
    // If user is authenticated, log the logout
    if (req.user) {
      logger.info(`User logout: ${req.user.email || req.user.phone}`, {
        userId: req.user.userId,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Logout error:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong during logout',
      timestamp: new Date().toISOString()
    });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'Please login again',
        timestamp: new Date().toISOString()
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Please login again',
        timestamp: new Date().toISOString()
      });
    }

    // Generate new access token
    const accessToken = generateToken(user);

    res.status(200).json({
      success: true,
      token: accessToken,
      tokenType: 'Bearer',
      expiresIn: '24h',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Token refresh error:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(401).json({
      error: 'Invalid refresh token',
      message: 'Please login again',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;