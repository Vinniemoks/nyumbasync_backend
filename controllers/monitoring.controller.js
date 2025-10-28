const systemMonitor = require('../utils/system-monitor');
const { logAdminActivity } = require('../utils/logger');

// Monitoring Controller
const monitoringController = {
  // Get health status
  async getHealthStatus(req, res) {
    try {
      const health = await systemMonitor.runHealthChecks();

      // Log if status is degraded
      if (health.status === 'degraded') {
        await logAdminActivity(req.user._id, 'HEALTH_CHECK_DEGRADED', health);
      }

      res.json(health);
    } catch (error) {
      console.error('Health Check Error:', error);
      res.status(500).json({ error: 'Failed to check system health' });
    }
  },

  // Get system metrics
  async getSystemMetrics(req, res) {
    try {
      const metrics = await systemMonitor.getSystemMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Metrics Error:', error);
      res.status(500).json({ error: 'Failed to get system metrics' });
    }
  },

  // Get alerts
  async getAlerts(req, res) {
    try {
      const { type, level, limit } = req.query;
      const alerts = systemMonitor.getAlerts({ type, level, limit: parseInt(limit) });
      res.json({ alerts });
    } catch (error) {
      console.error('Alerts Error:', error);
      res.status(500).json({ error: 'Failed to get system alerts' });
    }
  },

  // Get system status with detailed information
  async getDetailedStatus(req, res) {
    try {
      const [health, metrics, recentAlerts] = await Promise.all([
        systemMonitor.runHealthChecks(),
        systemMonitor.getSystemMetrics(),
        systemMonitor.getAlerts({ limit: 10 })
      ]);

      res.json({
        timestamp: new Date(),
        health,
        metrics,
        recentAlerts
      });
    } catch (error) {
      console.error('Status Error:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  }
};

module.exports = monitoringController;