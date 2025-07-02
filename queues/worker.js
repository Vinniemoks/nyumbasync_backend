const paymentQueue = require('./payment.queue');
const maintenanceQueue = require('./maintenance.queue');
const notificationQueue = require('./notification.queue');
const { logSystemEvent } = require('../utils/logger');

// Nairobi-specific queue priorities
const PRIORITIES = {
  MPESA_RETRY: 1,
  EMERGENCY_REPAIR: 2,
  RENT_REMINDER: 3,
  GENERAL_NOTIFICATION: 4
};

// Start workers with Kenyan timezone
process.env.TZ = 'Africa/Nairobi';

// Error handling for unstable networks
const handleQueueError = (error) => {
  logSystemEvent('QUEUE_ERROR', {
    error: error.message,
    timestamp: new Date().toLocaleString('en-KE')
  });
  
  // Attempt reconnection
  setTimeout(() => {
    if (error.code === 'ECONNREFUSED') {
      startQueues();
    }
  }, 5000);
};

const startQueues = () => {
  paymentQueue
    .on('error', handleQueueError)
    .on('failed', (job, err) => {
      logSystemEvent('PAYMENT_JOB_FAILED', { 
        reference: job.data.reference, 
        error: err.message 
      });
    });

  maintenanceQueue
    .on('error', handleQueueError)
    .on('completed', (job) => {
      logSystemEvent('VENDOR_ASSIGNED', job.returnvalue);
    });

  notificationQueue
    .on('error', handleQueueError)
    .on('progress', (job) => {
      logSystemEvent('SMS_IN_PROGRESS', { 
        phone: job.data.phone.replace(/(\d{4})\d{4}(\d{2})/, '$1****$2') 
      });
    });
};

module.exports = {
  startQueues,
  PRIORITIES
};
