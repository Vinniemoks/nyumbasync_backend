const { body } = require('express-validator');
const User = require('../models/user');

// Validation rules for user registration
exports.registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .escape(),

  body('email')
    .normalizeEmail() // Converts Test@Example.com → test@example.com
    .toLowerCase() // Ensures case-insensitive uniqueness
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(['landlord', 'tenant', 'admin']).withMessage('Invalid role')
];

// Validation rules for user login
exports.loginValidator = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Custom validator: Password must contain 1 number, 1 uppercase, and 1 symbol
const isStrongPassword = (value) => {
  if (!/[A-Z]/.test(value)) throw new Error('Password must contain at least 1 uppercase letter');
  if (!/[0-9]/.test(value)) throw new Error('Password must contain at least 1 number');
  if (!/[!@#$%^&*]/.test(value)) throw new Error('Password must contain at least 1 symbol');
  return true;
};

exports.registerValidator = [
  body('password').custom(isStrongPassword),
];

exports.registerValidator = [
  body('email').custom(async (email) => {
    const user = await User.findOne({ email });
    if (user) throw new Error('Email already in use');
  }),
];

// Phone Number Mpesa Validation
body('phone')
  .optional()
  .trim()
  .matches(/^\+?[0-9]{10,15}$/).withMessage('Invalid phone number')
  .customSanitizer(phone => phone.replace(/\D/g, '')) // Remove non-digits
