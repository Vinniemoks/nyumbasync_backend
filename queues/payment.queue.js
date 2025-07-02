const Queue = require('bull');
const { logTransaction } = require('../utils/logger');
const mpesaService = require('../services/mpesa.service');

// Configure Redis for Kenyan ISPs
const paymentQueue = new Queue('mpesa-payments', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379,
    connectTimeout: 30000, // High for unstable networks
    retryStrategy: (times) => {
      return Math.min(times * 2000, 60000); // Max 1min delay
    }
  }
});

// Process payment retries (Safaricom-specific)
paymentQueue.process('retry-mpesa', async (job) => {
  const { phone, amount, reference } = job.data;
  
  try {
    logTransaction('MPESA_RETRY_ATTEMPT', { reference, attempt: job.attemptsMade + 1 });
    
    const result = await mpesaService.initiateSTKPush(phone, amount, reference);
    
    return { 
      status: 'retry_success',
      mpesaCode: result.CheckoutRequestID 
    };
  } catch (error) {
    if (job.attemptsMade >= 2) { // Max 3 attempts
      await notifyAdmin(reference);
    }
    throw error; // Will trigger retry
  }
});

// Kenyan business hours (8AM-8PM EAT)
paymentQueue.on('active', (job) => {
  const nairobiHour = new Date().toLocaleString('en-KE', { 
    timeZone: 'Africa/Nairobi',
    hour: 'numeric'
  });
  
  if (nairobiHour < 8 || nairobiHour >= 20) {
    job.delayUntil(new Date().setHours(8, 0, 0, 0)); // Delay till 8AM
  }
});

// Event listeners for Kenyan compliance
paymentQueue.on('completed', (job) => {
  logTransaction('MPESA_RETRY_SUCCESS', job.returnvalue);
});

paymentQueue.on('failed', (job, err) => {
  logTransaction('MPESA_RETRY_FAILED', { 
    reference: job.data.reference, 
    error: err.message 
  });
});

module.exports = paymentQueue;
