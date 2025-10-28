const cluster = require('cluster');
const os = require('os');
const logger = require('./utils/logger');
const LoadBalancer = require('./utils/load-balancer');
const WorkerHealth = require('./utils/worker-health');

// Configuration
const numCPUs = process.env.MAX_WORKERS || os.cpus().length;
const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL || 30000; // 30 seconds
const GRACEFUL_SHUTDOWN_TIMEOUT = process.env.GRACEFUL_SHUTDOWN_TIMEOUT || 30000; // 30 seconds

// Main cluster management functionality
function setupCluster() {
  if (cluster.isPrimary) {
    logger.info(`Primary ${process.pid} is running`);
    logger.info(`Setting up ${numCPUs} workers with ${process.env.LOAD_BALANCER_STRATEGY || 'round-robin'} strategy...`);

    // Initialize load balancer
    const loadBalancer = new LoadBalancer();

    // Fork workers based on configuration
    for (let i = 0; i < numCPUs; i++) {
      const worker = cluster.fork();
      loadBalancer.registerWorker(worker);
    }

    // Set up health checks
    const healthChecks = new Map();
    
    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} died. Signal: ${signal}. Code: ${code}`);
      loadBalancer.removeWorker(worker.id);
      
      // Start a new worker
      logger.info('Starting a new worker...');
      const newWorker = cluster.fork();
      loadBalancer.registerWorker(newWorker);
    });

    // Monitor workers and handle health updates
    cluster.on('message', (worker, message) => {
      if (message.type === 'health_status') {
        loadBalancer.updateWorkerHealth(worker.id, message.data);
        
        // Check if worker needs to be replaced
        if (!message.data.healthy) {
          logger.warn(`Worker ${worker.process.pid} is unhealthy. Planning replacement...`);
          worker.disconnect();
        }
      }
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Primary received SIGTERM. Starting graceful shutdown...');
      
      // Stop accepting new connections
      const workers = Object.values(cluster.workers);
      
      // Give workers time to finish processing
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Graceful shutdown timed out. Forcing exit...');
        process.exit(1);
      }, GRACEFUL_SHUTDOWN_TIMEOUT);

      // Wait for workers to finish
      try {
        await Promise.all(workers.map(worker => {
          return new Promise((resolve) => {
            worker.on('disconnect', resolve);
            worker.send({ type: 'shutdown' });
          });
        }));
        
        clearTimeout(shutdownTimeout);
        logger.info('All workers disconnected. Shutting down...');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    // Periodic cluster status logging
    setInterval(() => {
      const status = loadBalancer.getClusterStatus();
      logger.info('Cluster status:', status);
    }, HEALTH_CHECK_INTERVAL);

  } else {
    // Initialize worker health monitoring
    const workerHealth = new WorkerHealth();
    
    // Start server for worker processes
    const server = require('./server');
    logger.info(`Worker ${process.pid} started`);

    // Set up periodic health reporting
    const healthCheckInterval = setInterval(async () => {
      const healthStatus = await workerHealth.getHealthStatus();
      process.send({ type: 'health_status', data: healthStatus });
    }, HEALTH_CHECK_INTERVAL);

    // Track request metrics
    server.on('request', (req, res) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        workerHealth.trackRequest(duration, res.statusCode >= 400);
      });
    });

    // Handle graceful shutdown
    process.on('message', async (message) => {
      if (message.type === 'shutdown') {
        logger.info(`Worker ${process.pid} received shutdown signal`);
        
        // Stop health checks
        clearInterval(healthCheckInterval);
        
        // Stop accepting new requests
        server.close(() => {
          logger.info(`Worker ${process.pid} closed all connections`);
          process.exit(0);
        });
        
        // Force shutdown after timeout
        setTimeout(() => {
          logger.warn(`Worker ${process.pid} shutdown timed out. Forcing exit...`);
          process.exit(1);
        }, GRACEFUL_SHUTDOWN_TIMEOUT);
      }
    });
  }
}

// Handle uncaught exceptions in the cluster
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  if (cluster.isPrimary) {
    // Primary process should exit on uncaught exceptions
    process.exit(1);
  } else {
    // Workers should notify primary and let it handle replacement
    process.send({ type: 'health_status', data: { healthy: false, error: err.message } });
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (cluster.isPrimary) {
    process.exit(1);
  } else {
    process.send({ type: 'health_status', data: { healthy: false, error: reason } });
  }
});

// Export the setup function
module.exports = setupCluster;