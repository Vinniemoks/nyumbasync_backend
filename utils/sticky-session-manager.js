const logger = require('../utils/logger');

class StickySessionManager {
  constructor() {
    this.sessionMap = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 1800000); // 30 minutes
  }

  /**
   * Assign or retrieve worker for a session
   */
  getWorkerForSession(sessionId, availableWorkers) {
    if (!sessionId) return null;

    const existing = this.sessionMap.get(sessionId);
    if (existing && availableWorkers.find(w => w.id === existing.workerId)) {
      existing.lastAccess = Date.now();
      return existing.workerId;
    }

    // Assign new worker for session
    const worker = availableWorkers[Math.floor(Math.random() * availableWorkers.length)];
    if (worker) {
      this.sessionMap.set(sessionId, {
        workerId: worker.id,
        created: Date.now(),
        lastAccess: Date.now()
      });
      return worker.id;
    }

    return null;
  }

  /**
   * Remove session mapping
   */
  removeSession(sessionId) {
    this.sessionMap.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    const SESSION_TIMEOUT = 1800000; // 30 minutes

    for (const [sessionId, data] of this.sessionMap.entries()) {
      if (now - data.lastAccess > SESSION_TIMEOUT) {
        this.sessionMap.delete(sessionId);
        logger.debug(`Removed expired session mapping: ${sessionId}`);
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats() {
    return {
      totalSessions: this.sessionMap.size,
      sessions: Array.from(this.sessionMap.entries()).map(([sessionId, data]) => ({
        sessionId,
        workerId: data.workerId,
        age: Date.now() - data.created,
        lastAccess: new Date(data.lastAccess).toISOString()
      }))
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    this.sessionMap.clear();
  }
}

module.exports = StickySessionManager;