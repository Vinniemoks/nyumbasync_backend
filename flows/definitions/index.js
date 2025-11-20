/**
 * Flow Definitions Index
 * Loads all pre-built flow definitions
 */

const buyerNurturing = require('./buyerNurturing');
const transactionPipeline = require('./transactionPipeline');
const propertyMatching = require('./propertyMatching');
const tenantJourney = require('./tenantJourney');

module.exports = {
  buyerNurturing,
  transactionPipeline,
  propertyMatching,
  tenantJourney,
  
  // Get all flows as a flat array
  getAllFlows() {
    // Convert tenant journey object to array
    const tenantJourneyFlows = Object.values(tenantJourney);
    
    return [
      ...buyerNurturing,
      ...transactionPipeline,
      ...propertyMatching,
      ...tenantJourneyFlows
    ];
  },
  
  // Get flows by category
  getFlowsByCategory(category) {
    const categories = {
      'buyer-nurturing': buyerNurturing,
      'transaction-pipeline': transactionPipeline,
      'property-matching': propertyMatching,
      'tenant-journey': Object.values(tenantJourney)
    };
    
    return categories[category] || [];
  }
};
