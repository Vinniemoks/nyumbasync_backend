const logger = require('../utils/logger');

class WorkerRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequestsPerIP = options.maxRequestsPerIP || 100;
    this.maxRequestsPerWorker = options.maxRequestsPerWorker || 1000;
    this.ipRequests = new Map();
    this.workerRequests = 0;
    this.lastReset = Date.now();
  }

  /**
   * Check if request should be rate limited
   */
  checkLimit(ip) {
    const now = Date.now();

    // Reset counters if window has passed
    if (now - this.lastReset > this.windowMs) {
      this.ipRequests.clear();
      this.workerRequests = 0;
      this.lastReset = now;
    }

    // Check worker-wide limit
    if (this.workerRequests >= this.maxRequestsPerWorker) {
      return {
        allowed: false,
        reason: 'worker_limit',
        resetIn: this.windowMs - (now - this.lastReset)
      };
    }

    // Check IP-specific limit
    const ipCount = (this.ipRequests.get(ip) || 0) + 1;
    if (ipCount > this.maxRequestsPerIP) {
      return {
        allowed: false,
        reason: 'ip_limit',
        resetIn: this.windowMs - (now - this.lastReset)
      };
    }

    // Update counters
    this.ipRequests.set(ip, ipCount);
    this.workerRequests++;

    return {
      allowed: true,
      remaining: {
        ip: this.maxRequestsPerIP - ipCount,
        worker: this.maxRequestsPerWorker - this.workerRequests
      }
    };
  }

  /**
   * Get current rate limiting statistics
   */
  getStats() {
    const now = Date.now();
    return {
      windowMs: this.windowMs,
      timeUntilReset: this.windowMs - (now - this.lastReset),
      uniqueIPs: this.ipRequests.size,
      totalRequests: this.workerRequests,
      maxRequestsPerIP: this.maxRequestsPerIP,
      maxRequestsPerWorker: this.maxRequestsPerWorker,
      topIPs: Array.from(this.ipRequests.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }))
    };
  }
}

module.exports = WorkerRateLimiter;