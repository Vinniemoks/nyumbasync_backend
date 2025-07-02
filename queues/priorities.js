// Nairobi-specific queue priorities
module.exports = {
  // Payment retries (high priority during business hours)
  MPESA_RETRY: {
    priority: 1,
    concurrency: 5,
    businessHoursOnly: true
  },

  // Emergency repairs (plumbing, electrical)
  EMERGENCY_REPAIR: {
    priority: 2,
    concurrency: 3,
    conditions: {
      subcounties: ['Westlands', 'Kilimani'], // Faster response areas
      timeWindow: '24/7'
    }
  },

  // Rent reminders (lower priority)
  RENT_REMINDER: {
    priority: 3,
    concurrency: 10,
    schedule: {
      // 1st-5th of month, 8AM-5PM
      days: Array.from({ length: 5 }, (_, i) => i + 1),
      hours: { start: 8, end: 17 }
    }
  },

  // General notifications
  GENERAL_NOTIFICATION: {
    priority: 4,
    concurrency: 20,
    rateLimiter: {
      max: 100,
      duration: 60000 // 100/min max
    }
  }
};
