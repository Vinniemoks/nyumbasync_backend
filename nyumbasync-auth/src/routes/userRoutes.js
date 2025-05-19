const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { registerValidator, loginValidator } = require('../validators/authValidator');
const { validate } = require('../middleware/validate');
const { mpesaPhoneValidator } = require('../validators/mpesaValidator');
const router = express.Router();

router.post(
     '/register',
     registerValidator, 
     mpesaPhoneValidator, 
     validate, 
     register);

router.post('/login', login);
router.get('/me', protect, getMe); // Protected route

module.exports = router;
