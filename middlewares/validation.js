const { body, validationResult } = require('express-validator');
const User = require('../models/user.model');
const { validateKenyanPhone } = require('../utils/auth');

exports.validatePhoneRegistration = [
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
      const existingUser = await User.findOne({ phone, mpesaVerified: true });
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

exports.validateVerificationCode = [
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