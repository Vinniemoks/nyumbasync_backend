const path = require('path');

// Define test priority groups (Kenya-specific critical paths)
const TEST_PRIORITY_GROUPS = {
  MPESA: ['mpesa', 'payment'],    // M-Pesa tests run first (critical for revenue)
  AUTH: ['auth', 'otp'],          // Auth before property listings
  PROPERTY: ['property', 'geolocation'], // Nairobi property tests
  MAINTENANCE: ['maintenance'],   // Low-priority vendor workflows
  UTILS: ['utils']                // Non-critical utilities
};

class NyumbaSyncSequencer {
  constructor() {
    this._priorityMap = new Map();
    Object.entries(TEST_PRIORITY_GROUPS).forEach(([priority, keywords]) => {
      keywords.forEach(keyword => this._priorityMap.set(keyword, priority));
    });
  }

  // Sort tests by priority group
  sort(tests) {
    const getPriority = (test) => {
      const testName = path.basename(test.path).toLowerCase();
      for (const [keyword, priority] of this._priorityMap) {
        if (testName.includes(keyword)) return priority;
      }
      return 'ZZZ'; // Lowest priority for unmatched tests
    };

    return [...tests].sort((a, b) => {
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      return priorityA.localeCompare(priorityB);
    });
  }
}

module.exports = NyumbaSyncSequencer;