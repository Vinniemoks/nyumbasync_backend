const AuditLog = require('../models/audit-log.model');
const { logAdminActivity } = require('../utils/logger');

// Helper function to categorize actions
const categorizeAction = (action) => {
  const categories = {
    authentication: ['LOGIN', 'LOGOUT', '2FA', 'PASSWORD'],
    authorization: ['PERMISSION', 'ROLE', 'ACCESS'],
    user_management: ['USER', 'PROFILE', 'ACCOUNT'],
    property_management: ['PROPERTY', 'LEASE', 'UNIT'],
    financial: ['PAYMENT', 'TRANSACTION', 'MPESA'],
    maintenance: ['MAINTENANCE', 'REPAIR', 'SERVICE'],
    system: ['BACKUP', 'RESTORE', 'CONFIG', 'HEALTH'],
    security: ['SECURITY', 'ALERT', 'THREAT']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => action.includes(keyword))) {
      return category;
    }
  }
  return 'other';
};

// Audit Controller
const auditController = {
  // Create audit log
  async createAuditLog(req, userId, action, details, status = 'success') {
    try {
      const auditLog = await AuditLog.create({
        userId,
        action,
        category: categorizeAction(action),
        details,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status
      });

      return auditLog;
    } catch (error) {
      console.error('Audit Log Creation Error:', error);
      return null;
    }
  },

  // Get audit logs with filtering and pagination
  async getAuditLogs(req, res) {
    try {
      const {
        userId,
        action,
        category,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 50,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};

      if (userId) query.userId = userId;
      if (action) query.action = new RegExp(action, 'i');
      if (category) query.category = category;
      if (status) query.status = status;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Execute query with pagination
      const totalLogs = await AuditLog.countDocuments(query);
      const totalPages = Math.ceil(totalLogs / limit);
      const skip = (page - 1) * limit;

      const logs = await AuditLog.find(query)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email role');

      res.json({
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalLogs,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('Audit Log Retrieval Error:', error);
      res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
  },

  // Get audit log statistics
  async getAuditStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const dateQuery = {};
      if (startDate || endDate) {
        dateQuery.timestamp = {};
        if (startDate) dateQuery.timestamp.$gte = new Date(startDate);
        if (endDate) dateQuery.timestamp.$lte = new Date(endDate);
      }

      const stats = await AuditLog.aggregate([
        { $match: dateQuery },
        {
          $facet: {
            categoryStats: [
              { $group: {
                _id: '$category',
                count: { $sum: 1 }
              }},
              { $sort: { count: -1 } }
            ],
            statusStats: [
              { $group: {
                _id: '$status',
                count: { $sum: 1 }
              }}
            ],
            timeDistribution: [
              { $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$timestamp'
                  }
                },
                count: { $sum: 1 }
              }},
              { $sort: { '_id': 1 } }
            ],
            userStats: [
              { $group: {
                _id: '$userId',
                activityCount: { $sum: 1 }
              }},
              { $sort: { activityCount: -1 } },
              { $limit: 10 }
            ]
          }
        }
      ]);

      // Populate user details for top users
      const userIds = stats[0].userStats.map(stat => stat._id);
      const users = await User.find({ _id: { $in: userIds } }, 'email role');
      const userMap = users.reduce((map, user) => {
        map[user._id] = user;
        return map;
      }, {});

      stats[0].userStats = stats[0].userStats.map(stat => ({
        ...stat,
        user: userMap[stat._id]
      }));

      res.json({
        timeframe: {
          start: startDate || 'all time',
          end: endDate || 'present'
        },
        stats: stats[0]
      });
    } catch (error) {
      console.error('Audit Stats Error:', error);
      res.status(500).json({ error: 'Failed to retrieve audit statistics' });
    }
  },

  // Export audit logs
  async exportAuditLogs(req, res) {
    try {
      const { format = 'csv', ...filters } = req.query;

      // Build query from filters
      const query = {};
      if (filters.userId) query.userId = filters.userId;
      if (filters.action) query.action = new RegExp(filters.action, 'i');
      if (filters.category) query.category = filters.category;
      if (filters.status) query.status = filters.status;
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
      }

      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .populate('userId', 'email role');

      if (format === 'csv') {
        const csv = await this.generateCSV(logs);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
        res.send(csv);
      } else if (format === 'json') {
        res.json({ logs });
      } else {
        res.status(400).json({ error: 'Unsupported export format' });
      }
    } catch (error) {
      console.error('Audit Log Export Error:', error);
      res.status(500).json({ error: 'Failed to export audit logs' });
    }
  },

  // Helper method to generate CSV
  async generateCSV(logs) {
    const fields = [
      'Timestamp',
      'User Email',
      'User Role',
      'Action',
      'Category',
      'Status',
      'IP Address',
      'User Agent',
      'Details'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.userId.email,
      log.userId.role,
      log.action,
      log.category,
      log.status,
      log.ipAddress,
      log.userAgent,
      JSON.stringify(log.details)
    ]);

    return [fields.join(',')]
      .concat(rows.map(row => row.join(',')))
      .join('\n');
  }
};

module.exports = auditController;