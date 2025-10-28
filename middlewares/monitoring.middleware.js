const { logActivity } = require('../utils/logger');
const { cache } = require('../utils/cache');
const performanceMetrics = require('../utils/performanceMetrics');

const monitoringMiddleware = {
  // Request tracking
  requestTracker: (req, res, next) => {
    req.startTime = Date.now();
    
    // Track original URL
    req.originalPath = req.path;

    // Add response listener
    res.on('finish', () => {
      const duration = Date.now() - req.startTime;
      
      // Log slow requests
      const slowThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000;
      if (duration > slowThreshold) {
        logActivity({
          type: 'SLOW_REQUEST',
          path: req.originalPath,
          method: req.method,
          duration,
          user: req.user?._id
        });
      }

      // Record metrics
      performanceMetrics.recordRequestMetrics({
        path: req.originalPath,
        method: req.method,
        statusCode: res.statusCode,
        duration
      });
    });

    next();
  },

  // Performance monitoring
  performanceMonitor: (req, res, next) => {
    const start = process.hrtime();

    // Monitor memory usage
    const startMemory = process.memoryUsage();

    res.on('finish', () => {
      const endMemory = process.memoryUsage();
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = seconds * 1000 + nanoseconds / 1000000;

      // Record memory metrics
      performanceMetrics.recordMemoryMetrics({
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        external: endMemory.external,
        path: req.originalPath
      });

      // Record response time
      performanceMetrics.recordResponseTime(req.originalPath, duration);
    });

    next();
  },

  // Resource usage tracking
  resourceMonitor: (req, res, next) => {
    const startCpu = process.cpuUsage();
    const startMemory = process.memoryUsage();

    res.on('finish', () => {
      const endCpu = process.cpuUsage(startCpu);
      const endMemory = process.memoryUsage();

      performanceMetrics.recordResourceUsage({
        path: req.originalPath,
        cpu: {
          user: endCpu.user,
          system: endCpu.system
        },
        memory: {
          delta: endMemory.heapUsed - startMemory.heapUsed,
          total: endMemory.heapTotal
        }
      });
    });

    next();
  },

  // Cache monitoring
  cacheMonitor: (req, res, next) => {
    const originalSend = res.send;

    res.send = function (body) {
      if (req.method === 'GET') {
        const cacheHit = res.get('X-Cache') === 'HIT';
        performanceMetrics.recordCacheMetrics({
          path: req.originalPath,
          hit: cacheHit,
          size: Buffer.byteLength(JSON.stringify(body), 'utf8')
        });
      }

      originalSend.call(this, body);
    };

    next();
  },

  // Database query monitoring
  queryMonitor: (req, res, next) => {
    if (!req.mongooseQueryTimes) {
      req.mongooseQueryTimes = [];
    }

    // Monitor query execution time
    const originalExec = req.app.locals.db.Query.prototype.exec;

    req.app.locals.db.Query.prototype.exec = async function() {
      const start = Date.now();
      const result = await originalExec.apply(this, arguments);
      const duration = Date.now() - start;

      req.mongooseQueryTimes.push({
        query: this.getQuery(),
        duration
      });

      // Log slow queries
      const slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000;
      if (duration > slowQueryThreshold) {
        logActivity({
          type: 'SLOW_QUERY',
          query: this.getQuery(),
          duration,
          collection: this.model.collection.name
        });
      }

      return result;
    };

    res.on('finish', () => {
      // Restore original exec
      req.app.locals.db.Query.prototype.exec = originalExec;

      // Record query metrics
      if (req.mongooseQueryTimes.length > 0) {
        performanceMetrics.recordQueryMetrics({
          path: req.originalPath,
          queries: req.mongooseQueryTimes
        });
      }
    });

    next();
  },

  // Error monitoring
  errorMonitor: (err, req, res, next) => {
    // Track error occurrence
    performanceMetrics.recordError({
      path: req.originalPath,
      error: err.message,
      stack: err.stack,
      type: err.name
    });

    // Check error threshold
    const errorCount = performanceMetrics.getErrorCount(req.originalPath);
    const threshold = parseInt(process.env.ERROR_NOTIFICATION_THRESHOLD) || 10;
    
    if (errorCount >= threshold) {
      // Notify about error threshold breach
      logActivity({
        type: 'ERROR_THRESHOLD_BREACH',
        path: req.originalPath,
        count: errorCount,
        error: err.message
      });
    }

    next(err);
  }
};

module.exports = monitoringMiddleware;