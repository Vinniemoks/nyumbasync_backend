const express = require('express');
const router = express.Router();
const biometricController = require('../../controllers/biometric.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Registration endpoints (require authentication)
router.post('/register/challenge', authenticateToken, biometricController.registerChallenge);
router.post('/register/verify', authenticateToken, biometricController.registerVerify);

// Login endpoints (public)
router.post('/login/challenge', biometricController.loginChallenge);
router.post('/login/verify', biometricController.loginVerify);

// Management endpoints (require authentication)
router.get('/credentials', authenticateToken, biometricController.listCredentials);
router.delete('/credentials/:credentialId', authenticateToken, biometricController.removeCredential);

module.exports = router;
