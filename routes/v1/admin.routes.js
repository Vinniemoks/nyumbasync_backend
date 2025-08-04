const router = require('express').Router();
const adminController = require('../../controllers/admin.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Admin-only access
router.use(authenticate('admin'));

// Kenyan compliance endpoints
router.get('/compliance',
  adminController.checkCompliance
);

router.post('/notices',
  adminController.sendLegalNotices
);

// Reporting
router.get('/reports/rent',
  adminController.generateFinancialReport
);

module.exports = router;
