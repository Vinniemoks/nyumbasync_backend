const mongoose = require('mongoose');
const Property = require('../models/property.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const Maintenance = require('../models/maintenance.model');
const { logAdminActivity } = require('../utils/logger');

// Helper function for date ranges
const getDateRange = (period) => {
  const now = new Date();
  const ranges = {
    today: {
      start: new Date(now.setHours(0, 0, 0, 0)),
      end: new Date(now.setHours(23, 59, 59, 999))
    },
    week: {
      start: new Date(now.setDate(now.getDate() - 7)),
      end: new Date()
    },
    month: {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
    },
    year: {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31)
    }
  };
  return ranges[period] || ranges.month;
};

// Analytics Controller
const analyticsController = {
  // Get Dashboard Overview
  async getDashboardStats(req, res) {
    try {
      const { period = 'month' } = req.query;
      const dateRange = getDateRange(period);
      const isLandlord = req.user.role === 'landlord';
      const landlordId = req.user._id;

      let propertyMatch = {};
      let transactionMatch = {
        createdAt: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      };
      let maintenanceMatch = {
        createdAt: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      };

      if (isLandlord) {
        // Find all properties owned by this landlord
        const properties = await Property.find({ landlord: landlordId }).select('_id');
        const propertyIds = properties.map(p => p._id);

        propertyMatch = { landlord: new mongoose.Types.ObjectId(landlordId) };
        transactionMatch.property = { $in: propertyIds };
        maintenanceMatch.property = { $in: propertyIds };
      }

      const [
        userStats,
        propertyStats,
        transactionStats,
        maintenanceStats
      ] = await Promise.all([
        // User Statistics (or Tenant Stats for Landlord)
        isLandlord ?
          Property.aggregate([
            { $match: { landlord: new mongoose.Types.ObjectId(landlordId), 'currentTenant.tenantId': { $exists: true } } },
            { $group: { _id: null, count: { $sum: 1 } } }
          ]) :
          User.aggregate([
            {
              $facet: {
                total: [{ $count: 'count' }],
                byRole: [
                  { $group: { _id: '$role', count: { $sum: 1 } } }
                ],
                recent: [
                  { $match: { createdAt: { $gte: dateRange.start } } },
                  { $count: 'count' }
                ]
              }
            }
          ]),

        // Property Statistics
        Property.aggregate([
          { $match: propertyMatch },
          {
            $facet: {
              total: [{ $count: 'count' }],
              occupied: [
                { $match: { status: 'occupied' } },
                { $count: 'count' }
              ],
              byType: [
                { $group: { _id: '$type', count: { $sum: 1 } } }
              ],
              revenue: [
                {
                  $group: {
                    _id: null,
                    total: { $sum: '$rentAmount' }
                  }
                }
              ]
            }
          }
        ]),

        // Transaction Statistics
        Transaction.aggregate([
          { $match: transactionMatch },
          {
            $facet: {
              total: [
                {
                  $group: {
                    _id: null,
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                  }
                }
              ],
              byStatus: [
                {
                  $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                  }
                }
              ],
              daily: [
                {
                  $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                  }
                }
              ]
            }
          }
        ]),

        // Maintenance Statistics
        Maintenance.aggregate([
          { $match: maintenanceMatch },
          {
            $facet: {
              total: [{ $count: 'count' }],
              byStatus: [
                { $group: { _id: '$status', count: { $sum: 1 } } }
              ],
              byPriority: [
                { $group: { _id: '$priority', count: { $sum: 1 } } }
              ],
              avgResponseTime: [
                { $match: { resolvedAt: { $exists: true } } },
                {
                  $group: {
                    _id: null,
                    avg: {
                      $avg: {
                        $divide: [
                          { $subtract: ['$resolvedAt', '$createdAt'] },
                          3600000 // Convert to hours
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        ])
      ]);

      // Format response
      const response = {
        period,
        dateRange: {
          start: dateRange.start,
          end: dateRange.end
        },
        users: isLandlord ? {
          total: userStats[0]?.count || 0,
          byRole: [], // Not applicable for landlord
          newUsers: 0
        } : {
          total: userStats[0].total[0]?.count || 0,
          byRole: userStats[0].byRole,
          newUsers: userStats[0].recent[0]?.count || 0
        },
        properties: {
          total: propertyStats[0].total[0]?.count || 0,
          occupied: propertyStats[0].occupied[0]?.count || 0,
          byType: propertyStats[0].byType,
          potentialRevenue: propertyStats[0].revenue[0]?.total || 0
        },
        transactions: {
          total: {
            count: transactionStats[0].total[0]?.count || 0,
            amount: transactionStats[0].total[0]?.amount || 0
          },
          byStatus: transactionStats[0].byStatus,
          daily: transactionStats[0].daily
        },
        maintenance: {
          total: maintenanceStats[0].total[0]?.count || 0,
          byStatus: maintenanceStats[0].byStatus,
          byPriority: maintenanceStats[0].byPriority,
          avgResponseTime: maintenanceStats[0].avgResponseTime[0]?.avg || 0
        }
      };

      // Log activity
      await logAdminActivity(req.user._id, 'ANALYTICS_ACCESSED', {
        period,
        timestamp: new Date()
      });

      res.json(response);
    } catch (error) {
      console.error('Analytics Error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
  },

  // Get Detailed Property Analytics
  async getPropertyAnalytics(req, res) {
    try {
      const { period = 'month' } = req.query;
      const dateRange = getDateRange(period);

      const analytics = await Property.aggregate([
        {
          $lookup: {
            from: 'transactions',
            localField: '_id',
            foreignField: 'propertyId',
            pipeline: [
              {
                $match: {
                  createdAt: {
                    $gte: dateRange.start,
                    $lte: dateRange.end
                  }
                }
              }
            ],
            as: 'transactions'
          }
        },
        {
          $lookup: {
            from: 'maintenances',
            localField: '_id',
            foreignField: 'propertyId',
            pipeline: [
              {
                $match: {
                  createdAt: {
                    $gte: dateRange.start,
                    $lte: dateRange.end
                  }
                }
              }
            ],
            as: 'maintenance'
          }
        },
        {
          $project: {
            title: 1,
            type: 1,
            status: 1,
            rentAmount: 1,
            occupancyRate: {
              $multiply: [
                {
                  $divide: [
                    { $size: '$transactions' },
                    {
                      $subtract: [
                        { $dayOfMonth: dateRange.end },
                        { $dayOfMonth: dateRange.start }
                      ]
                    }
                  ]
                },
                100
              ]
            },
            revenue: {
              $sum: '$transactions.amount'
            },
            maintenanceCosts: {
              $sum: '$maintenance.cost'
            },
            profitMargin: {
              $multiply: [
                {
                  $divide: [
                    {
                      $subtract: [
                        { $sum: '$transactions.amount' },
                        { $sum: '$maintenance.cost' }
                      ]
                    },
                    { $sum: '$transactions.amount' }
                  ]
                },
                100
              ]
            }
          }
        },
        {
          $sort: { revenue: -1 }
        }
      ]);

      res.json({
        period,
        dateRange,
        analytics
      });
    } catch (error) {
      console.error('Property Analytics Error:', error);
      res.status(500).json({ error: 'Failed to fetch property analytics' });
    }
  },

  // Get Financial Analytics
  async getFinancialAnalytics(req, res) {
    try {
      const { period = 'month', groupBy = 'day' } = req.query;
      const dateRange = getDateRange(period);

      const analytics = await Transaction.aggregate([
        {
          $match: {
            createdAt: {
              $gte: dateRange.start,
              $lte: dateRange.end
            }
          }
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  {
                    case: { $eq: [groupBy, 'day'] },
                    then: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                  },
                  {
                    case: { $eq: [groupBy, 'week'] },
                    then: { $week: '$createdAt' }
                  },
                  {
                    case: { $eq: [groupBy, 'month'] },
                    then: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
                  }
                ],
                default: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
              }
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            successful: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ]);

      // Calculate trends and metrics
      const totalTransactions = analytics.reduce((sum, day) => sum + day.count, 0);
      const totalAmount = analytics.reduce((sum, day) => sum + day.totalAmount, 0);
      const successRate = totalTransactions > 0 ?
        (analytics.reduce((sum, day) => sum + day.successful, 0) / totalTransactions) * 100 : 0;

      res.json({
        period,
        groupBy,
        dateRange,
        summary: {
          totalTransactions,
          totalAmount,
          successRate,
          averageTransactionValue: totalTransactions > 0 ? totalAmount / totalTransactions : 0
        },
        analytics
      });
    } catch (error) {
      console.error('Financial Analytics Error:', error);
      res.status(500).json({ error: 'Failed to fetch financial analytics' });
    }
  },

  // Get User Analytics
  async getUserAnalytics(req, res) {
    try {
      const { period = 'month' } = req.query;
      const dateRange = getDateRange(period);

      const analytics = await User.aggregate([
        {
          $facet: {
            growth: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                  },
                  newUsers: { $sum: 1 }
                }
              },
              { $sort: { '_id': 1 } }
            ],
            demographics: [
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 },
                  active: {
                    $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                  }
                }
              }
            ],
            engagement: [
              {
                $lookup: {
                  from: 'transactions',
                  localField: '_id',
                  foreignField: 'userId',
                  pipeline: [
                    {
                      $match: {
                        createdAt: {
                          $gte: dateRange.start,
                          $lte: dateRange.end
                        }
                      }
                    }
                  ],
                  as: 'transactions'
                }
              },
              {
                $project: {
                  role: 1,
                  transactionCount: { $size: '$transactions' },
                  totalSpent: { $sum: '$transactions.amount' }
                }
              },
              {
                $group: {
                  _id: '$role',
                  averageTransactions: { $avg: '$transactionCount' },
                  averageSpending: { $avg: '$totalSpent' }
                }
              }
            ]
          }
        }
      ]);

      res.json({
        period,
        dateRange,
        analytics: analytics[0]
      });
    } catch (error) {
      console.error('User Analytics Error:', error);
      res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
  }
};

module.exports = analyticsController;