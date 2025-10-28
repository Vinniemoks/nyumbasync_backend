const { createObjectDetector } = require('@tensorflow/tfjs-node');
const MaintenanceRequest = require('../models/maintenance.model');
const Property = require('../models/property.model');
const VendorModel = require('../models/vendor.model');
const { sendNotification } = require('../services/notification.service');

const maintenanceAIController = {
  // Analyze maintenance request images
  async analyzeMaintenanceImages(req, res) {
    try {
      const { requestId } = req.params;
      const maintenanceRequest = await MaintenanceRequest.findById(requestId);

      if (!maintenanceRequest) {
        return res.status(404).json({ error: 'Maintenance request not found' });
      }

      // Load AI model for issue detection
      const detector = await createObjectDetector('maintenance_issues_v2');

      // Analyze images
      const analysisResults = await Promise.all(
        maintenanceRequest.images.map(async image => {
          const analysis = await analyzeImage(detector, image.url);
          return {
            imageUrl: image.url,
            detectedIssues: analysis.issues,
            severity: analysis.severity,
            recommendations: analysis.recommendations
          };
        })
      );

      // Update maintenance request with AI insights
      maintenanceRequest.aiAnalysis = {
        timestamp: new Date(),
        results: analysisResults,
        overallSeverity: calculateOverallSeverity(analysisResults),
        recommendedPriority: determineRequestPriority(analysisResults)
      };

      await maintenanceRequest.save();

      // Find suitable vendors based on issue type
      const recommendedVendors = await findSuitableVendors(analysisResults);

      res.json({
        success: true,
        analysis: analysisResults,
        overallAssessment: {
          severity: maintenanceRequest.aiAnalysis.overallSeverity,
          priority: maintenanceRequest.aiAnalysis.recommendedPriority
        },
        recommendedVendors
      });
    } catch (error) {
      console.error('Maintenance Analysis Error:', error);
      res.status(500).json({ error: 'Failed to analyze maintenance images' });
    }
  },

  // Predict maintenance needs
  async predictMaintenanceNeeds(req, res) {
    try {
      const { propertyId } = req.params;
      
      const property = await Property.findById(propertyId)
        .populate('maintenanceHistory');

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Analyze maintenance history and patterns
      const maintenancePatterns = analyzeMaintenancePatterns(property.maintenanceHistory);

      // Generate predictions
      const predictions = await generateMaintenancePredictions({
        property,
        patterns: maintenancePatterns,
        seasonalFactors: getSeasonalFactors()
      });

      // Create maintenance schedule
      const schedule = generateMaintenanceSchedule(predictions);

      res.json({
        success: true,
        predictions: {
          upcomingIssues: predictions.potentialIssues,
          timeframes: predictions.timeframes,
          estimatedCosts: predictions.costs
        },
        recommendedSchedule: schedule,
        maintenanceInsights: predictions.insights
      });
    } catch (error) {
      console.error('Maintenance Prediction Error:', error);
      res.status(500).json({ error: 'Failed to predict maintenance needs' });
    }
  },

  // Get vendor recommendations
  async getVendorRecommendations(req, res) {
    try {
      const { requestId } = req.params;
      
      const request = await MaintenanceRequest.findById(requestId)
        .populate('aiAnalysis');

      if (!request) {
        return res.status(404).json({ error: 'Maintenance request not found' });
      }

      // Find suitable vendors
      const vendors = await findSuitableVendors(request.aiAnalysis.results);

      // Rank vendors based on multiple factors
      const rankedVendors = await rankVendors(vendors, {
        issueType: request.type,
        urgency: request.aiAnalysis.overallSeverity,
        location: request.property.location
      });

      res.json({
        success: true,
        recommendations: rankedVendors.map(vendor => ({
          vendor: {
            id: vendor._id,
            name: vendor.name,
            specialties: vendor.specialties,
            rating: vendor.rating
          },
          matchScore: vendor.matchScore,
          estimatedCost: vendor.estimatedCost,
          availability: vendor.availability
        }))
      });
    } catch (error) {
      console.error('Vendor Recommendation Error:', error);
      res.status(500).json({ error: 'Failed to get vendor recommendations' });
    }
  }
};

// Helper functions
async function analyzeImage(detector, imageUrl) {
  // Perform image analysis using TensorFlow.js
  const predictions = await detector.detect(imageUrl);

  // Process predictions
  const issues = predictions.map(pred => ({
    type: pred.class,
    confidence: pred.score,
    location: pred.bbox
  }));

  // Determine severity based on detected issues
  const severity = calculateIssueSeverity(issues);

  // Generate recommendations
  const recommendations = generateRecommendations(issues);

  return { issues, severity, recommendations };
}

function calculateIssueSeverity(issues) {
  const severityScores = {
    'water_damage': 0.9,
    'structural_crack': 0.8,
    'electrical_hazard': 0.9,
    'mold': 0.7,
    'pest_infestation': 0.6,
    'appliance_malfunction': 0.5,
    'cosmetic_damage': 0.3
  };

  const maxSeverity = Math.max(
    ...issues.map(issue => 
      severityScores[issue.type] * issue.confidence
    )
  );

  if (maxSeverity >= 0.8) return 'critical';
  if (maxSeverity >= 0.6) return 'high';
  if (maxSeverity >= 0.4) return 'medium';
  return 'low';
}

function generateRecommendations(issues) {
  const recommendations = [];

  issues.forEach(issue => {
    switch (issue.type) {
      case 'water_damage':
        recommendations.push({
          action: 'Immediate plumbing inspection required',
          urgency: 'high',
          specialistType: 'plumber'
        });
        break;
      case 'structural_crack':
        recommendations.push({
          action: 'Structural engineer assessment needed',
          urgency: 'high',
          specialistType: 'structural_engineer'
        });
        break;
      // Add more cases for other issue types
    }
  });

  return recommendations;
}

async function findSuitableVendors(analysisResults) {
  // Extract required specialties from analysis
  const requiredSpecialties = new Set(
    analysisResults.flatMap(result =>
      result.recommendations.map(rec => rec.specialistType)
    )
  );

  // Find vendors matching specialties
  const vendors = await VendorModel.find({
    specialties: { $in: Array.from(requiredSpecialties) },
    status: 'active',
    availability: true
  }).sort('-rating');

  return vendors;
}

function analyzeMaintenancePatterns(history) {
  // Group maintenance requests by type
  const requestsByType = history.reduce((acc, req) => {
    if (!acc[req.type]) acc[req.type] = [];
    acc[req.type].push(req);
    return acc;
  }, {});

  // Analyze patterns for each type
  const patterns = {};
  Object.entries(requestsByType).forEach(([type, requests]) => {
    patterns[type] = {
      frequency: calculateFrequency(requests),
      averageCost: calculateAverageCost(requests),
      seasonalTrends: analyzeSeasonalTrends(requests)
    };
  });

  return patterns;
}

async function generateMaintenancePredictions(data) {
  const { property, patterns, seasonalFactors } = data;

  // Calculate base predictions
  const basePredictions = Object.entries(patterns).map(([type, pattern]) => {
    const nextPredictedDate = predictNextOccurrence(pattern);
    const estimatedCost = pattern.averageCost * (1 + getInflationRate());
    
    return {
      issueType: type,
      predictedDate: nextPredictedDate,
      confidence: calculatePredictionConfidence(pattern),
      estimatedCost
    };
  });

  // Adjust for seasonal factors
  const adjustedPredictions = basePredictions.map(pred => {
    const seasonalImpact = seasonalFactors[pred.issueType] || 1;
    return {
      ...pred,
      predictedDate: adjustDateForSeason(pred.predictedDate, seasonalImpact)
    };
  });

  return {
    potentialIssues: adjustedPredictions.map(p => ({
      type: p.issueType,
      probability: p.confidence
    })),
    timeframes: adjustedPredictions.map(p => ({
      type: p.issueType,
      estimatedDate: p.predictedDate
    })),
    costs: adjustedPredictions.map(p => ({
      type: p.issueType,
      estimatedCost: p.estimatedCost
    })),
    insights: generateMaintenanceInsights(adjustedPredictions)
  };
}

function generateMaintenanceSchedule(predictions) {
  // Sort predictions by date and priority
  const sortedPredictions = predictions.potentialIssues
    .map((issue, index) => ({
      ...issue,
      date: predictions.timeframes[index].estimatedDate,
      cost: predictions.costs[index].estimatedCost
    }))
    .sort((a, b) => a.date - b.date);

  // Generate schedule with maintenance windows
  const schedule = sortedPredictions.map(pred => ({
    issueType: pred.type,
    maintenanceWindow: {
      start: pred.date,
      end: new Date(pred.date.getTime() + 14 * 24 * 60 * 60 * 1000) // 14 days window
    },
    estimatedDuration: estimateMaintenanceDuration(pred.type),
    estimatedCost: pred.cost,
    priority: calculateMaintenancePriority(pred)
  }));

  return schedule;
}

module.exports = maintenanceAIController;