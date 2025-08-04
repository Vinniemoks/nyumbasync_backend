const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const adminController = require('../../controllers/admin.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Removed global middleware and added to individual routes
router.get('/compliance',
  authenticate('admin'),
  asyncHandler(adminController.checkCompliance)
);

router.post('/notices',
  authenticate('admin'),
  asyncHandler(adminController.sendLegalNotices)
);

router.get('/reports/rent',
  authenticate('admin'),
  asyncHandler(adminController.generateFinancialReport)
);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Admin route error:', err);
  res.status(500).json({ error: 'Admin operation failed' });
});

module.exports = router;