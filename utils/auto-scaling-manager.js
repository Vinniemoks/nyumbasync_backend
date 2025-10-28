const os = require('os');
const logger = require('../utils/logger');

class AutoScalingManager {
  constructor(minWorkers = 2, maxWorkers = os.cpus().length * 2) {
    this.minWorkers = minWorkers;
    this.maxWorkers = maxWorkers;
    this.scaleUpThreshold = 0.75; // 75% CPU/Memory usage triggers scale up
    this.scaleDownThreshold = 0.25; // 25% CPU/Memory usage triggers scale down
    this.cooldownPeriod = 300000; // 5 minutes between scaling actions
    this.lastScaleAction = 0;
    this.metrics = [];
    this.metricsRetention = 60; // Keep last 60 measurements
  }

  /**
   * Record current metrics
   */
  recordMetrics(clusterMetrics) {
    const timestamp = Date.now();
    
    // Calculate aggregate metrics
    const aggregateMetrics = {
      timestamp,
      cpuUsage: 0,
      memoryUsage: 0,
      totalRequests: 0,
      errorRate: 0,
      avgResponseTime: 0
    };

    let workerCount = 0;
    for (const worker of clusterMetrics.workers) {
      if (worker.metrics && worker.metrics.process) {
        workerCount++;
        
        // CPU usage
        const cpuMetrics = worker.metrics.process.cpu;
        aggregateMetrics.cpuUsage += (cpuMetrics.user + cpuMetrics.system) / 1000000; // Convert to percentage

        // Memory usage
        const memMetrics = worker.metrics.process.memory;
        aggregateMetrics.memoryUsage += memMetrics.heapUsed / memMetrics.heapTotal;

        // Request metrics
        if (worker.metrics.requests) {
          aggregateMetrics.totalRequests += worker.metrics.requests.total || 0;
          aggregateMetrics.errorRate += worker.metrics.requests.errors || 0;
          aggregateMetrics.avgResponseTime += worker.metrics.requests.avgResponseTime || 0;
        }
      }
    }

    // Calculate averages
    if (workerCount > 0) {
      aggregateMetrics.cpuUsage /= workerCount;
      aggregateMetrics.memoryUsage /= workerCount;
      aggregateMetrics.avgResponseTime /= workerCount;
      aggregateMetrics.errorRate = aggregateMetrics.errorRate / aggregateMetrics.totalRequests || 0;
    }

    // Store metrics
    this.metrics.push(aggregateMetrics);
    if (this.metrics.length > this.metricsRetention) {
      this.metrics.shift();
    }

    return aggregateMetrics;
  }

  /**
   * Check if scaling is needed
   */
  async checkScaling(currentWorkers, clusterMetrics) {
    const now = Date.now();
    if (now - this.lastScaleAction < this.cooldownPeriod) {
      return { action: 'none', reason: 'cooldown' };
    }

    const metrics = this.recordMetrics(clusterMetrics);
    const recentMetrics = this.getRecentMetricsAverage(5); // Average of last 5 measurements

    // Check scale up conditions
    if (currentWorkers < this.maxWorkers) {
      if (recentMetrics.cpuUsage > this.scaleUpThreshold ||
          recentMetrics.memoryUsage > this.scaleUpThreshold ||
          recentMetrics.avgResponseTime > 1000) { // Response time > 1s
        this.lastScaleAction = now;
        return {
          action: 'scale_up',
          reason: 'high_load',
          metrics: recentMetrics
        };
      }
    }

    // Check scale down conditions
    if (currentWorkers > this.minWorkers) {
      if (recentMetrics.cpuUsage < this.scaleDownThreshold &&
          recentMetrics.memoryUsage < this.scaleDownThreshold &&
          recentMetrics.avgResponseTime < 500) { // Response time < 500ms
        this.lastScaleAction = now;
        return {
          action: 'scale_down',
          reason: 'low_load',
          metrics: recentMetrics
        };
      }
    }

    return { action: 'none', reason: 'stable', metrics: recentMetrics };
  }

  /**
   * Get average metrics for recent period
   */
  getRecentMetricsAverage(count = 5) {
    const recent = this.metrics.slice(-count);
    if (recent.length === 0) return null;

    const avg = {
      cpuUsage: 0,
      memoryUsage: 0,
      totalRequests: 0,
      errorRate: 0,
      avgResponseTime: 0
    };

    for (const metrics of recent) {
      avg.cpuUsage += metrics.cpuUsage;
      avg.memoryUsage += metrics.memoryUsage;
      avg.totalRequests += metrics.totalRequests;
      avg.errorRate += metrics.errorRate;
      avg.avgResponseTime += metrics.avgResponseTime;
    }

    // Calculate averages
    Object.keys(avg).forEach(key => {
      avg[key] = avg[key] / recent.length;
    });

    return avg;
  }

  /**
   * Get scaling recommendations
   */
  getRecommendations(currentWorkers) {
    const metrics = this.getRecentMetricsAverage();
    if (!metrics) return null;

    const recommendations = {
      currentWorkers,
      suggestedWorkers: currentWorkers,
      suggestions: []
    };

    // CPU-based recommendations
    if (metrics.cpuUsage > 0.8) {
      recommendations.suggestions.push({
        type: 'cpu',
        priority: 'high',
        message: 'High CPU usage detected. Consider scaling up.',
        metric: metrics.cpuUsage
      });
    }

    // Memory-based recommendations
    if (metrics.memoryUsage > 0.8) {
      recommendations.suggestions.push({
        type: 'memory',
        priority: 'high',
        message: 'High memory usage detected. Consider scaling up.',
        metric: metrics.memoryUsage
      });
    }

    // Response time recommendations
    if (metrics.avgResponseTime > 1000) {
      recommendations.suggestions.push({
        type: 'response_time',
        priority: 'medium',
        message: 'High response times detected. Consider optimizing or scaling up.',
        metric: metrics.avgResponseTime
      });
    }

    // Error rate recommendations
    if (metrics.errorRate > 0.05) {
      recommendations.suggestions.push({
        type: 'error_rate',
        priority: 'high',
        message: 'High error rate detected. Investigate issues.',
        metric: metrics.errorRate
      });
    }

    // Calculate suggested workers
    if (recommendations.suggestions.length > 0) {
      const highPriority = recommendations.suggestions.filter(s => s.priority === 'high').length;
      recommendations.suggestedWorkers = Math.min(
        this.maxWorkers,
        currentWorkers + highPriority
      );
    }

    return recommendations;
  }
}

module.exports = AutoScalingManager;