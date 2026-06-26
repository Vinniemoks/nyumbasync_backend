const Queue = require('bull');
const vendorService = require('../services/vendor.service');
const { getSubcounty } = require('../utils/geoUtils');

const maintenanceQueue = new Queue('repair-requests', {
  redis: {
    host: process.env.REDIS_HOST,
    // Nairobi-specific settings
    enableOfflineQueue: true, // Work without Redis connection
    maxRetriesPerRequest: 3
  },
  settings: {
    stalledInterval: 300000 // 5min check (for spotty networks)
  }
});

// Process repair requests by Nairobi subcounty
maintenanceQueue.process('assign-vendor', async (job) => {
  const { issueType, coordinates, requestId } = job.data;
  
  try {
    // 1. Get subcounty
    const subcounty = await getSubcounty(...coordinates);
    
    // 2. Find available vendor
    const assignment = await vendorService.assignVendor(
      issueType, 
      coordinates,
      subcounty
    );
    
    return {
      requestId,
      vendor: assignment.vendor,
      responseDeadline: assignment.responseDeadline
    };
  } catch (error) {
    // Escalate to county hotline if no vendors
    if (error.message === 'NO_VENDORS_AVAILABLE') {
      await escalateToCountyHotline(job.data);
    }
    throw error;
  }
});

// Prioritize emergency requests
maintenanceQueue.on('waiting', (jobId) => {
  if (jobId.data.priority === 'emergency') {
    jobId.promote(); // Move to front
  }
});

module.exports = maintenanceQueue;
