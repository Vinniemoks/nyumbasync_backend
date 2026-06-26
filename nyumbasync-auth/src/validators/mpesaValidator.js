const { body } = require('express-validator');

exports.mpesaPhoneValidator = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    // Match Kenyan formats: 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
    .matches(/^(?:254|\+254|0)?(7[0-9]{8})$/).withMessage('Invalid Safaricom number')
    // Convert to M-Pesa format (2547XXXXXXXX)
    .customSanitizer(phone => {
      const cleaned = phone.replace(/\D/g, ''); // Remove all non-digits
      return cleaned.startsWith('254') ? cleaned : `254${cleaned.slice(-9)}`;
    })
];
