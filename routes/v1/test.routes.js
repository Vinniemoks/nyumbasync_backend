const router = require('express').Router();

// Simple test route
router.get('/test/:id', (req, res) => {
  res.json({ success: true, id: req.params.id });
});

module.exports = router;