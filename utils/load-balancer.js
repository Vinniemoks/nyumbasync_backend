const cluster = require('cluster');
const logger = require('../utils/logger');
const StickySessionManager = require('./sticky-session-manager');
const AutoScalingManager = require('./auto-scaling-manager');
const WorkerRateLimiter = require('./worker-rate-limiter');

class LoadBalancer {
  constructor() {
    this.workers = new Map();
    this.strategy = process.env.LOAD_BALANCER_STRATEGY || 'round-robin';
    this.lastWorkerIndex = 0;
    
    // Initialize additional features
    this.stickySessionManager = new StickySessionManager();
    this.autoScalingManager = new AutoScalingManager(
      parseInt(process.env.MIN_WORKERS || '2'),
      parseInt(process.env.MAX_WORKERS || '8')
    );
    this.rateLimiter = new WorkerRateLimiter({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
      maxRequestsPerIP: parseInt(process.env.MAX_REQUESTS_PER_IP || '100'),
      maxRequestsPerWorker: parseInt(process.env.MAX_REQUESTS_PER_WORKER || '1000')
    });
  }

  // Register a new worker
  registerWorker(worker) {
    this.workers.set(worker.id, {
      worker,
      load: 0,
      lastAssigned: Date.now(),
      health: null
    });
  }

  // Remove a worker
  removeWorker(workerId) {
    this.workers.delete(workerId);
  }

  // Update worker health status
  updateWorkerHealth(workerId, health) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.health = health;
    }
  }

  // Get least loaded worker
  getLeastLoadedWorker() {
    let minLoad = Infinity;
    let selectedWorker = null;

    for (const [_, data] of this.workers) {
      if (data.load < minLoad && (data.health?.healthy !== false)) {
        minLoad = data.load;
        selectedWorker = data.worker;
      }
    }

    return selectedWorker;
  }

  // Get next worker using round-robin
  getRoundRobinWorker() {
    const workers = Array.from(this.workers.values())
      .filter(w => w.health?.healthy !== false)
      .map(w => w.worker);

    if (workers.length === 0) return null;

    this.lastWorkerIndex = (this.lastWorkerIndex + 1) % workers.length;
    return workers[this.lastWorkerIndex];
  }

  // Get worker based on response time
  getFastestWorker() {
    let minResponseTime = Infinity;
    let selectedWorker = null;

    for (const [_, data] of this.workers) {
      const avgResponseTime = data.health?.metrics?.requests?.avgResponseTime || Infinity;
      if (avgResponseTime < minResponseTime && (data.health?.healthy !== false)) {
        minResponseTime = avgResponseTime;
        selectedWorker = data.worker;
      }
    }

    return selectedWorker;
  }

  // Get next worker based on current strategy
  getNextWorker() {
    switch (this.strategy) {
      case 'least-loaded':
        return this.getLeastLoadedWorker();
      case 'response-time':
        return this.getFastestWorker();
      case 'round-robin':
      default:
        return this.getRoundRobinWorker();
    }
  }

  // Increment worker load
  incrementLoad(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.load++;
      worker.lastAssigned = Date.now();
    }
  }

  // Decrement worker load
  decrementLoad(workerId) {
    const worker = this.workers.get(workerId);
    if (worker && worker.load > 0) {
      worker.load--;
    }
  }

  // Get cluster health status
  getClusterStatus() {
    const status = {
      strategy: this.strategy,
      totalWorkers: this.workers.size,
      healthyWorkers: 0,
      workers: []
    };

    for (const [id, data] of this.workers) {
      if (data.health?.healthy) status.healthyWorkers++;
      
      status.workers.push({
        id,
        load: data.load,
        lastAssigned: data.lastAssigned,
        healthy: data.health?.healthy || null,
        metrics: data.health?.metrics || null
      });
    }

    return status;
  }
}

module.exports = LoadBalancer;