/**
 * In-process performance metrics collector.
 *
 * Lightweight counters/gauges consumed by monitoring.middleware. Metrics are
 * kept in memory and exposed via getSnapshot() for the monitoring endpoints;
 * swap for a StatsD/Prometheus client without changing call sites.
 */

const metrics = {
  requests: 0,
  errors: 0,
  responseTimes: [], // rolling window
  cache: { hits: 0, misses: 0 },
  queries: 0,
  lastMemory: null,
  lastResources: null,
};

const ROLLING_WINDOW = 500;

module.exports = {
  recordRequestMetrics(data = {}) {
    metrics.requests += 1;
    if (typeof data.duration === 'number') this.recordResponseTime(data.duration);
  },

  recordResponseTime(ms) {
    metrics.responseTimes.push(ms);
    if (metrics.responseTimes.length > ROLLING_WINDOW) metrics.responseTimes.shift();
  },

  recordError() {
    metrics.errors += 1;
  },

  getErrorCount() {
    return metrics.errors;
  },

  recordCacheMetrics(hit) {
    if (hit) metrics.cache.hits += 1;
    else metrics.cache.misses += 1;
  },

  recordQueryMetrics() {
    metrics.queries += 1;
  },

  recordMemoryMetrics() {
    metrics.lastMemory = process.memoryUsage();
  },

  recordResourceUsage() {
    metrics.lastResources = process.cpuUsage();
  },

  getSnapshot() {
    const times = metrics.responseTimes;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return {
      requests: metrics.requests,
      errors: metrics.errors,
      avgResponseMs: Math.round(avg),
      cache: { ...metrics.cache },
      queries: metrics.queries,
      memory: metrics.lastMemory,
    };
  },
};
