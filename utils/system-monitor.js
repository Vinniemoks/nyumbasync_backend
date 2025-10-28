const os = require('os');
const mongoose = require('mongoose');
const { createLogger } = require('winston');
const nodemailer = require('nodemailer');

class SystemMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      lastCheck: null,
      healthChecks: {},
      alerts: []
    };
    
    this.thresholds = {
      memory: 85, // 85% memory usage
      cpu: 80,    // 80% CPU usage
      disk: 90,   // 90% disk usage
      responseTime: 1000 // 1 second
    };
  }

  // Get system metrics
  async getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = (usedMem / totalMem) * 100;

    const cpuUsage = await this.getCPUUsage();
    
    return {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercentage: memoryUsage.toFixed(2)
      },
      cpu: {
        usage: cpuUsage.toFixed(2),
        cores: os.cpus().length
      },
      processMemory: process.memoryUsage(),
      platform: {
        type: os.type(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release()
      }
    };
  }

  // Get CPU usage
  async getCPUUsage() {
    const startMeasure = os.cpus().map(cpu => ({
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    const endMeasure = os.cpus().map(cpu => ({
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
    }));

    const cpuUsage = startMeasure.map((start, i) => {
      const end = endMeasure[i];
      const idleDiff = end.idle - start.idle;
      const totalDiff = end.total - start.total;
      const usage = 100 - (100 * idleDiff / totalDiff);
      return usage;
    });

    return cpuUsage.reduce((acc, usage) => acc + usage, 0) / cpuUsage.length;
  }

  // Check database health
  async checkDatabase() {
    try {
      const startTime = Date.now();
      const status = await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - startTime;

      return {
        status: status.ok === 1 ? 'healthy' : 'unhealthy',
        responseTime,
        connections: mongoose.connection.states[mongoose.connection.readyState]
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Check email service health
  async checkEmailService() {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const status = await transporter.verify();
      return {
        status: status ? 'healthy' : 'unhealthy'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Run all health checks
  async runHealthChecks() {
    const checks = {
      system: await this.getSystemMetrics(),
      database: await this.checkDatabase(),
      email: await this.checkEmailService()
    };

    this.metrics.lastCheck = new Date();
    this.metrics.healthChecks = checks;

    // Check for alerts
    this.checkAlerts(checks);

    return {
      timestamp: this.metrics.lastCheck,
      status: this.getOverallStatus(checks),
      checks
    };
  }

  // Get overall system status
  getOverallStatus(checks) {
    const statuses = [
      checks.database.status === 'healthy',
      checks.email.status === 'healthy',
      parseFloat(checks.system.memory.usagePercentage) < this.thresholds.memory,
      parseFloat(checks.system.cpu.usage) < this.thresholds.cpu
    ];

    return statuses.every(status => status) ? 'healthy' : 'degraded';
  }

  // Check for alerts
  checkAlerts(checks) {
    const newAlerts = [];

    // Memory alert
    if (parseFloat(checks.system.memory.usagePercentage) > this.thresholds.memory) {
      newAlerts.push({
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${checks.system.memory.usagePercentage}%`,
        timestamp: new Date()
      });
    }

    // CPU alert
    if (parseFloat(checks.system.cpu.usage) > this.thresholds.cpu) {
      newAlerts.push({
        type: 'cpu',
        level: 'warning',
        message: `High CPU usage: ${checks.system.cpu.usage}%`,
        timestamp: new Date()
      });
    }

    // Database alert
    if (checks.database.status === 'unhealthy') {
      newAlerts.push({
        type: 'database',
        level: 'critical',
        message: 'Database health check failed',
        timestamp: new Date()
      });
    }

    // Email service alert
    if (checks.email.status === 'unhealthy') {
      newAlerts.push({
        type: 'email',
        level: 'critical',
        message: 'Email service health check failed',
        timestamp: new Date()
      });
    }

    this.metrics.alerts = [...this.metrics.alerts, ...newAlerts];

    // Keep only last 100 alerts
    if (this.metrics.alerts.length > 100) {
      this.metrics.alerts = this.metrics.alerts.slice(-100);
    }

    return newAlerts;
  }

  // Get alerts
  getAlerts(options = {}) {
    let alerts = [...this.metrics.alerts];

    if (options.type) {
      alerts = alerts.filter(alert => alert.type === options.type);
    }

    if (options.level) {
      alerts = alerts.filter(alert => alert.level === options.level);
    }

    if (options.limit) {
      alerts = alerts.slice(-options.limit);
    }

    return alerts;
  }
}

module.exports = new SystemMonitor();