const mongoose = require('mongoose');
const TenantProfile = require('../models/tenant.model');
const Property = require('../models/property.model');
const { logActivity } = require('../utils/logger');

const matchingController = {
  // Generate tenant-property matches
  async generateMatches(req, res) {
    try {
      const { propertyId } = req.params;
      const { 
        budget,
        occupancyDate,
        minScore = 70,
        includeWaitlist = false 
      } = req.query;

      // Get property details
      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Build matching criteria
      const matchCriteria = {
        'preferences.maxBudget': { $gte: property.rentAmount },
        'preferences.minBudget': { $lte: property.rentAmount },
        'verification.score': { $gte: minScore },
        'status': includeWaitlist ? { $in: ['active', 'waitlist'] } : 'active'
      };

      if (occupancyDate) {
        matchCriteria['preferences.moveInDate'] = {
          $lte: new Date(occupancyDate)
        };
      }

      // Find matching tenants
      const matches = await TenantProfile.find(matchCriteria)
        .select('user verification preferences history')
        .populate('user', 'name email phone')
        .sort({ 'verification.score': -1 });

      // Calculate compatibility scores
      const scoredMatches = matches.map(tenant => {
        const score = calculateCompatibilityScore(property, tenant);
        return {
          tenant,
          compatibilityScore: score,
          matchDetails: generateMatchDetails(property, tenant)
        };
      });

      // Sort by compatibility score
      scoredMatches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      // Log activity
      await logActivity({
        type: 'TENANT_MATCHING',
        user: req.user._id,
        property: propertyId,
        details: {
          matchesFound: scoredMatches.length,
          criteria: { budget, occupancyDate, minScore }
        }
      });

      res.json({
        success: true,
        matches: scoredMatches,
        totalMatches: scoredMatches.length
      });
    } catch (error) {
      console.error('Tenant Matching Error:', error);
      res.status(500).json({ error: 'Failed to generate tenant matches' });
    }
  },

  // Get detailed tenant-property compatibility analysis
  async getCompatibilityAnalysis(req, res) {
    try {
      const { propertyId, tenantId } = req.params;

      const [property, tenant] = await Promise.all([
        Property.findById(propertyId),
        TenantProfile.findById(tenantId).populate('user')
      ]);

      if (!property || !tenant) {
        return res.status(404).json({ error: 'Property or tenant not found' });
      }

      // Generate detailed compatibility analysis
      const analysis = {
        overall: calculateCompatibilityScore(property, tenant),
        categories: {
          financial: analyzeFinancialCompatibility(property, tenant),
          lifestyle: analyzeLifestyleCompatibility(property, tenant),
          location: analyzeLocationPreferences(property, tenant),
          timing: analyzeTimingAlignment(property, tenant)
        },
        recommendations: generateRecommendations(property, tenant),
        riskFactors: assessRiskFactors(property, tenant)
      };

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error('Compatibility Analysis Error:', error);
      res.status(500).json({ error: 'Failed to generate compatibility analysis' });
    }
  }
};

// Helper functions
function calculateCompatibilityScore(property, tenant) {
  let score = 0;
  const weights = {
    financial: 0.4,
    lifestyle: 0.2,
    location: 0.2,
    timing: 0.2
  };

  // Financial compatibility
  const financialScore = analyzeFinancialCompatibility(property, tenant);
  score += financialScore * weights.financial;

  // Lifestyle compatibility
  const lifestyleScore = analyzeLifestyleCompatibility(property, tenant);
  score += lifestyleScore * weights.lifestyle;

  // Location preferences
  const locationScore = analyzeLocationPreferences(property, tenant);
  score += locationScore * weights.location;

  // Timing alignment
  const timingScore = analyzeTimingAlignment(property, tenant);
  score += timingScore * weights.timing;

  return Math.round(score * 100) / 100;
}

function analyzeFinancialCompatibility(property, tenant) {
  let score = 0;

  // Rent affordability
  const rentRatio = property.rentAmount / tenant.preferences.maxBudget;
  if (rentRatio <= 0.8) score += 40;
  else if (rentRatio <= 0.9) score += 30;
  else if (rentRatio <= 1) score += 20;

  // Payment history
  const paymentHistory = tenant.history?.paymentHistory || [];
  const latePayments = paymentHistory.filter(p => p.status === 'late').length;
  if (latePayments === 0) score += 40;
  else if (latePayments <= 2) score += 30;
  else if (latePayments <= 4) score += 20;

  // Credit score / verification score
  const verificationScore = tenant.verification?.score || 0;
  score += (verificationScore / 100) * 20;

  return score / 100;
}

function analyzeLifestyleCompatibility(property, tenant) {
  let score = 0;
  const preferences = tenant.preferences;

  // Property type match
  if (property.type === preferences.propertyType) score += 30;

  // Amenities match
  const desiredAmenities = preferences.amenities || [];
  const availableAmenities = property.amenities || [];
  const amenityMatch = desiredAmenities.filter(a => 
    availableAmenities.includes(a)
  ).length / desiredAmenities.length;
  score += amenityMatch * 40;

  // Occupancy rules
  if (property.rules?.petsAllowed === preferences.hasPets) score += 15;
  if (property.rules?.smokingAllowed === preferences.isSmoker) score += 15;

  return score / 100;
}

function analyzeLocationPreferences(property, tenant) {
  let score = 0;
  const preferences = tenant.preferences;

  // Distance to preferred locations
  if (isWithinPreferredDistance(property, preferences.preferredLocations)) {
    score += 40;
  }

  // Neighborhood type match
  if (property.neighborhood?.type === preferences.neighborhoodType) {
    score += 30;
  }

  // Access to transportation
  if (property.transportation?.nearby === preferences.needsTransportation) {
    score += 30;
  }

  return score / 100;
}

function analyzeTimingAlignment(property, tenant) {
  let score = 0;
  const preferences = tenant.preferences;

  // Move-in date alignment
  const moveInDelta = Math.abs(
    new Date(property.availableFrom) - new Date(preferences.moveInDate)
  ) / (1000 * 60 * 60 * 24); // difference in days

  if (moveInDelta === 0) score += 50;
  else if (moveInDelta <= 15) score += 40;
  else if (moveInDelta <= 30) score += 30;
  else if (moveInDelta <= 60) score += 20;

  // Lease duration match
  if (property.leaseDuration === preferences.preferredLeaseDuration) {
    score += 50;
  } else if (Math.abs(property.leaseDuration - preferences.preferredLeaseDuration) <= 6) {
    score += 30;
  }

  return score / 100;
}

function generateMatchDetails(property, tenant) {
  return {
    financialSummary: {
      rentRatio: (property.rentAmount / tenant.preferences.maxBudget * 100).toFixed(1) + '%',
      paymentHistory: summarizePaymentHistory(tenant.history?.paymentHistory),
      verificationScore: tenant.verification?.score || 0
    },
    lifestyleMatch: {
      propertyTypeMatch: property.type === tenant.preferences.propertyType,
      amenityMatches: getMatchingAmenities(property.amenities, tenant.preferences.amenities),
      ruleCompatibility: checkRuleCompatibility(property.rules, tenant.preferences)
    },
    locationMatch: {
      distanceToPreferred: calculateDistanceToPreferred(property, tenant.preferences.preferredLocations),
      neighborhoodMatch: property.neighborhood?.type === tenant.preferences.neighborhoodType,
      transportationMatch: property.transportation?.nearby === tenant.preferences.needsTransportation
    },
    timing: {
      moveInDateDelta: calculateMoveInDateDelta(property.availableFrom, tenant.preferences.moveInDate),
      leaseDurationMatch: property.leaseDuration === tenant.preferences.preferredLeaseDuration
    }
  };
}

function generateRecommendations(property, tenant) {
  const recommendations = [];
  const analysis = generateMatchDetails(property, tenant);

  // Financial recommendations
  if (analysis.financialSummary.rentRatio > 90) {
    recommendations.push({
      category: 'financial',
      priority: 'high',
      suggestion: 'Consider negotiating rent terms or exploring rent guarantee options'
    });
  }

  // Lifestyle recommendations
  if (!analysis.lifestyleMatch.propertyTypeMatch) {
    recommendations.push({
      category: 'lifestyle',
      priority: 'medium',
      suggestion: 'Discuss property type preferences and potential compromises'
    });
  }

  // Location recommendations
  if (analysis.locationMatch.distanceToPreferred > 5) {
    recommendations.push({
      category: 'location',
      priority: 'medium',
      suggestion: 'Highlight transportation options and neighborhood amenities'
    });
  }

  // Timing recommendations
  if (Math.abs(analysis.timing.moveInDateDelta) > 30) {
    recommendations.push({
      category: 'timing',
      priority: 'high',
      suggestion: 'Discuss potential temporary arrangements or lease start date flexibility'
    });
  }

  return recommendations;
}

function assessRiskFactors(property, tenant) {
  const riskFactors = [];
  
  // Financial risks
  if (property.rentAmount > tenant.preferences.maxBudget * 0.9) {
    riskFactors.push({
      category: 'financial',
      severity: 'high',
      description: 'Rent amount close to tenant\'s maximum budget',
      mitigation: 'Consider requesting additional security deposit or rent guarantee'
    });
  }

  // Payment history risks
  const latePayments = (tenant.history?.paymentHistory || [])
    .filter(p => p.status === 'late').length;
  if (latePayments > 2) {
    riskFactors.push({
      category: 'financial',
      severity: 'medium',
      description: 'History of late payments',
      mitigation: 'Set up automatic payments and clear payment terms'
    });
  }

  // Occupancy risks
  if (property.rules?.petsAllowed === false && tenant.preferences.hasPets) {
    riskFactors.push({
      category: 'occupancy',
      severity: 'high',
      description: 'Pet ownership conflicts with property rules',
      mitigation: 'Clear communication of pet policy and potential exceptions'
    });
  }

  return riskFactors;
}

module.exports = matchingController;