const express = require('express');
const asyncHandler = require('express-async-handler');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { authenticate } = require('../../middlewares/auth.middleware');
const c = require('../../controllers/onboarding.controller');

const router = express.Router();

// The client-side routes are public (the emailed token is the credential), so
// keep guessing and password-trying expensive.
const limiter = new RateLimiterMemory({ points: 30, duration: 60 });
const limit = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  limiter.consume(req.ip).then(() => next()).catch(() => res.status(429).json({ error: 'Too many attempts. Please wait a minute.' }));
};

const OWNER = ['landlord', 'agent', 'manager'];

// Owner side
router.get('/defaults', authenticate(OWNER), c.getDefaults);
router.get('/invites', authenticate(OWNER), asyncHandler(c.listInvites));
router.post('/invites', authenticate(OWNER), asyncHandler(c.createInvite));
router.post('/invites/:id/resend', authenticate(OWNER), asyncHandler(c.resendInvite));
router.delete('/invites/:id', authenticate(OWNER), asyncHandler(c.revokeInvite));

// Client side (public)
router.get('/invitations/:token', limit, asyncHandler(c.getInvitation));
router.post('/invitations/:token/accept', limit, asyncHandler(c.acceptInvitation));

module.exports = router;
