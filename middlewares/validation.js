const { body, validationResult } = require('express-validator');
const User = require('../models/user.model');
const { validateKenyanPhone } = require('../utils/auth');

const validatePhoneRegistration = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom(phone => {
      if (!validateKenyanPhone(phone)) {
        throw new Error('Invalid Kenyan phone. Use format 2547... or 2541...');
      }
      return true;
    })
    .custom(async phone => {
      // Increased timeout for this query
      const existingUser = await User.findOne({ phone, mpesaVerified: true }).maxTimeMS(20000);
      if (existingUser) {
        throw new Error('Phone number already registered');
      }
      return true;
    }),

  body('role')
    .optional()
    .isIn(['tenant', 'landlord']).withMessage('Role must be either tenant or landlord'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

const validateVerificationCode = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom(phone => {
      if (!validateKenyanPhone(phone)) {
        throw new Error('Invalid Kenyan phone format');
      }
      return true;
    }),

  body('code')
    .trim()
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 4, max: 4 }).withMessage('Code must be exactly 4 digits')
    .isNumeric().withMessage('Code must contain only numbers'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

const validateMpesaPayment = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom(phone => {
      if (!validateKenyanPhone(phone)) {
        throw new Error('Invalid Kenyan phone. Use format 2547... or 2541...');
      }
      return true;
    }),
  body('amount')
    .isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
  body('propertyId')
    .isMongoId().withMessage('Invalid property ID'),
  body('houseNumber')
    .notEmpty().withMessage('House number is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }
    next();
  },
];

// Add validateUpdateUser that's referenced in user.routes.js
const validateUpdateUser = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format'),
  
  body('phone')
    .optional()
    .custom(phone => {
      if (!validateKenyanPhone(phone)) {
        throw new Error('Invalid Kenyan phone format');
      }
      return true;
    }),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

const { validatePropertyApproval } = require('./validation/property-approval.validation');

module.exports = {
  validatePhoneRegistration,
  validateVerificationCode,
  validateMpesaPayment,
  validateUpdateUser,
  validatePropertyApproval
};