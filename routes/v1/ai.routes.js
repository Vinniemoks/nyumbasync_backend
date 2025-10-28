const express = require('express');
const router = express.Router();
const matchingController = require('../../controllers/matching.controller');
const marketAnalysisController = require('../../controllers/market-analysis.controller');
const maintenanceAIController = require('../../controllers/maintenance-ai.controller');
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth.middleware');

// Tenant Matching Routes
router.get('/tenant-matches/:propertyId',
  authMiddleware,
  roleMiddleware(['admin', 'landlord', 'propertyManager']),
  matchingController.generateMatches
);

router.get('/compatibility-analysis/:propertyId/:tenantId',
  authMiddleware,
  roleMiddleware(['admin', 'landlord', 'propertyManager']),
  matchingController.getCompatibilityAnalysis
);

// Market Analysis Routes
router.get('/market-analysis',
  authMiddleware,
  marketAnalysisController.getMarketAnalysis
);

router.post('/price-prediction',
  authMiddleware,
  marketAnalysisController.getPricePrediction
);

router.post('/investment-analysis',
  authMiddleware,
  marketAnalysisController.getInvestmentAnalysis
);

// AI Maintenance Routes
router.post('/maintenance/:requestId/analyze',
  authMiddleware,
  maintenanceAIController.analyzeMaintenanceImages
);

router.get('/maintenance/predict/:propertyId',
  authMiddleware,
  maintenanceAIController.predictMaintenanceNeeds
);

router.get('/maintenance/:requestId/vendors',
  authMiddleware,
  maintenanceAIController.getVendorRecommendations
);

module.exports = router;