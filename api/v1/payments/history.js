const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const Payment = require('../../models/Payment');
const { check, validationResult } = require('express-validator');

// @route   GET api/v1/payments/history
// @desc    Get paginated payment history with filters
// @access  Private (Tenant/Landlord/Admin)
router.get(
  '/',
  [
    auth,
    [
      check('page', 'Page number must be a positive integer').optional().isInt({ min: 1 }),
      check('limit', 'Limit must be between 1 and 100').optional().isInt({ min: 1, max: 100 }),
      check('startDate', 'Start date must be a valid date').optional().isISO8601(),
      check('endDate', 'End date must be a valid date').optional().isISO8601(),
      check('status', 'Status must be valid').optional().isIn(['pending', 'completed', 'verified', 'disputed'])
    ]
  ],
  async (req, res) => {
    // Validate request query parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Destructure query parameters with defaults
      const {
        page = 1,
        limit = 10,
        startDate,
        endDate,
        status,
        propertyId,
        sortBy = 'paymentDate',
        sortOrder = 'desc'
      } = req.query;

      // Build base query based on user role
      let query = {};
      if (req.user.role === 'tenant') {
        query.tenant = req.user.id;
      } else if (req.user.role === 'landlord') {
        query.landlord = req.user.id;
      }
      // Admins can see all payments without additional filters

      // Add date range filter if provided
      if (startDate || endDate) {
        query.paymentDate = {};
        if (startDate) query.paymentDate.$gte = new Date(startDate);
        if (endDate) query.paymentDate.$lte = new Date(endDate);
      }

      // Add status filter if provided
      if (status) {
        query.status = status;
      }

      // Add property filter if provided
      if (propertyId) {
        query.property = propertyId;
      }

      // Execute paginated query
      const payments = await Payment.find(query)
        .populate('tenant', ['name', 'phone'])
        .populate('landlord', ['name', 'phone'])
        .populate('property', ['title', 'address'])
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination metadata
      const totalCount = await Payment.countDocuments(query);

      // Format response with metadata
      const response = {
        success: true,
        data: payments,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        },
        filters: {
          startDate,
          endDate,
          status,
          propertyId
        }
      };

      res.json(response);
    } catch (err) {
      console.error('Payment history error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
);

// @route   GET api/v1/payments/history/summary
// @desc    Get payment summary statistics
// @access  Private (Tenant/Landlord/Admin)
router.get('/summary', auth, async (req, res) => {
  try {
    // Build base query based on user role
    let matchQuery = {};
    if (req.user.role === 'tenant') {
      matchQuery.tenant = req.user.id;
    } else if (req.user.role === 'landlord') {
      matchQuery.landlord = req.user.id;
    }

    // Aggregate payment data for summary
    const summary = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averagePayment: { $avg: '$amount' },
          pendingPayments: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          completedPayments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          verifiedPayments: {
            $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalPayments: 1,
          totalAmount: 1,
          averagePayment: { $round: ['$averagePayment', 2] },
          pendingPayments: 1,
          completedPayments: 1,
          verifiedPayments: 1
        }
      }
    ]);

    // Get recent 3 payments
    const recentPayments = await Payment.find(matchQuery)
      .sort({ paymentDate: -1 })
      .limit(3)
      .populate('property', ['title'])
      .lean();

    res.json({
      success: true,
      summary: summary[0] || {},
      recentPayments
    });
  } catch (err) {
    console.error('Payment summary error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;