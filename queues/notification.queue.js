const Queue = require('bull');
const smsService = require('../services/sms.service');
const { formatKenyanDate } = require('../utils/formatters');

const notificationQueue = new Queue('notifications', {
  redis: process.env.REDIS_URL,
  limiter: {
    max: 30, // Safaricom SMS limit
    duration: 60000 // Per minute
  }
});

// Process SMS notifications
notificationQueue.process('send-sms', async (job) => {
  const { phone, message } = job.data;
  
  try {
    const result = await smsService.sendSMS(phone, message);
    return { 
      ...result,
      timestamp: formatKenyanDate(new Date())
    };
  } catch (error) {
    if (error.message === 'SMS_PROVIDERS_UNAVAILABLE') {
      await storeForLaterRetry(job.data);
    }
    throw error;
  }
});

// Schedule SMS during business hours (8AM-8PM)
notificationQueue.add('send-sms', data, {
  delay: getNextBusinessHourDelay(),
  attempts: 3,
  backoff: {
    type: 'fixed',
    delay: 60000 // Retry every minute
  }
});

// Utility function for Kenyan business hours
function getNextBusinessHourDelay() {
  const now = new Date();
  const nairobiTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const currentHour = new Date(nairobiTime).getHours();
  
  if (currentHour >= 20) { // After 8PM
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(8, 0, 0, 0); // Next day 8AM
    return nextDay - now;
  }
  return 0;
}

module.exports = notificationQueue;
