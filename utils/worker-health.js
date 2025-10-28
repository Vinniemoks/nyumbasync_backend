const os = require('os');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const logger = require('../utils/logger');

class WorkerHealth {
  constructor() {
    this.healthMetrics = {
      cpu: 0,
      memory: 0,
      lastChecked: Date.now(),
      requestCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };
  }

  // Update request metrics
  trackRequest(duration, isError = false) {
    this.healthMetrics.requestCount++;
    if (isError) this.healthMetrics.errorCount++;
    this.healthMetrics.totalResponseTime += duration;
    this.healthMetrics.avgResponseTime = 
      this.healthMetrics.totalResponseTime / this.healthMetrics.requestCount;
  }

  // Get current process metrics
  async getProcessMetrics() {
    try {
      const processStats = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      return {
        memory: {
          heapUsed: processStats.heapUsed,
          heapTotal: processStats.heapTotal,
          external: processStats.external,
          rss: processStats.rss
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Failed to get process metrics:', error);
      return null;
    }
  }

  // Get system metrics
  async getSystemMetrics() {
    try {
      const loadAvg = os.loadavg();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      return {
        loadAverage: loadAvg[0], // 1 minute load average
        memory: {
          total: totalMem,
          free: freeMem,
          used: totalMem - freeMem
        },
        cpuCount: os.cpus().length
      };
    } catch (error) {
      logger.error('Failed to get system metrics:', error);
      return null;
    }
  }

  // Check if the worker is healthy
  async isHealthy() {
    const metrics = await this.getProcessMetrics();
    if (!metrics) return false;

    // Define thresholds
    const MEMORY_THRESHOLD = 0.9; // 90% of heap
    const ERROR_RATE_THRESHOLD = 0.1; // 10% error rate
    const RESPONSE_TIME_THRESHOLD = 5000; // 5 seconds

    // Check memory usage
    const memoryUsage = metrics.memory.heapUsed / metrics.memory.heapTotal;
    if (memoryUsage > MEMORY_THRESHOLD) {
      logger.warn(`High memory usage: ${(memoryUsage * 100).toFixed(2)}%`);
      return false;
    }

    // Check error rate
    const errorRate = this.healthMetrics.errorCount / this.healthMetrics.requestCount;
    if (errorRate > ERROR_RATE_THRESHOLD) {
      logger.warn(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
      return false;
    }

    // Check average response time
    if (this.healthMetrics.avgResponseTime > RESPONSE_TIME_THRESHOLD) {
      logger.warn(`High average response time: ${this.healthMetrics.avgResponseTime}ms`);
      return false;
    }

    return true;
  }

  // Get complete health status
  async getHealthStatus() {
    const [processMetrics, systemMetrics] = await Promise.all([
      this.getProcessMetrics(),
      this.getSystemMetrics()
    ]);

    return {
      workerId: process.pid,
      healthy: await this.isHealthy(),
      timestamp: Date.now(),
      metrics: {
        process: processMetrics,
        system: systemMetrics,
        requests: {
          total: this.healthMetrics.requestCount,
          errors: this.healthMetrics.errorCount,
          avgResponseTime: this.healthMetrics.avgResponseTime
        }
      }
    };
  }
}

module.exports = WorkerHealth;