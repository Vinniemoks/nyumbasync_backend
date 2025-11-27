const express = require('express');
const router = express.Router();
const videoCallController = require('../../controllers/videoCall.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// All routes require authentication
router.use(authenticateToken);

// Generate access token for video calling
router.post('/token', videoCallController.generateToken.bind(videoCallController));

// Create a new video room
router.post('/room', videoCallController.createRoom.bind(videoCallController));

// Get list of active rooms
router.get('/rooms', videoCallController.getActiveRooms.bind(videoCallController));

// End a video call
router.post('/end/:roomSid', videoCallController.endRoom.bind(videoCallController));

// Get call history
router.get('/history', videoCallController.getCallHistory.bind(videoCallController));

// Webhook for Twilio status callbacks (no auth required)
router.post('/webhook', videoCallController.handleWebhook.bind(videoCallController));

module.exports = router;
