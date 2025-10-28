const PaymentModel = require('../models/payment.model');
const TransactionModel = require('../models/transaction.model');
const LeaseModel = require('../models/lease.model');
const { generateReport } = require('../services/report.service');
const { sendEmail } = require('../services/email.service');
const { sendSMS } = require('../services/sms.service');

const financialController = {
  // Generate comprehensive financial report
  async generateFinancialReport(req, res) {
    try {
      const { 
        propertyId, 
        startDate, 
        endDate, 
        reportType,
        includeExpenses,
        includeForecasts 
      } = req.query;

      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (end < start) {
        return res.status(400).json({
          error: 'Invalid date range'
        });
      }

      // Gather financial data
      const [payments, expenses, leases] = await Promise.all([
        PaymentModel.find({
          property: propertyId,
          createdAt: { $gte: start, $lte: end },
          status: 'completed'
        }),
        includeExpenses ? ExpenseModel.find({
          property: propertyId,
          date: { $gte: start, $lte: end }
        }) : [],
        LeaseModel.find({
          property: propertyId,
          startDate: { $lte: end },
          endDate: { $gte: start }
        }).populate('tenant')
      ]);

      // Calculate key metrics
      const metrics = {
        totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
        totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
        netIncome: 0,
        occupancyRate: 0,
        collectionRate: 0
      };

      // Calculate occupancy rate
      const totalUnits = leases.length;
      const occupiedUnits = leases.filter(l => 
        l.status === 'active' && 
        l.startDate <= end && 
        l.endDate >= start
      ).length;
      
      metrics.occupancyRate = (occupiedUnits / totalUnits) * 100;

      // Calculate collection rate
      const totalDue = leases.reduce((sum, lease) => sum + lease.monthlyRent, 0);
      const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
      metrics.collectionRate = (totalCollected / totalDue) * 100;

      // Calculate net income
      metrics.netIncome = metrics.totalRevenue - metrics.totalExpenses;

      // Generate forecasts if requested
      let forecasts = null;
      if (includeForecasts) {
        forecasts = await generateForecasts(propertyId, metrics, payments, expenses);
      }

      // Generate report using report service
      const report = await generateReport({
        type: reportType,
        data: {
          metrics,
          payments,
          expenses,
          leases,
          forecasts
        },
        dateRange: { start, end }
      });

      res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Financial Report Error:', error);
      res.status(500).json({
        error: 'Failed to generate financial report'
      });
    }
  },

  // Handle payment disputes
  async handlePaymentDispute(req, res) {
    try {
      const { 
        paymentId, 
        reason, 
        evidenceUrls,
        resolution 
      } = req.body;

      const payment = await PaymentModel.findById(paymentId)
        .populate('tenant')
        .populate('property');

      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      // Create dispute record
      const dispute = await PaymentDisputeModel.create({
        payment: paymentId,
        tenant: payment.tenant._id,
        property: payment.property._id,
        reason,
        evidenceUrls,
        resolution,
        status: 'under_review'
      });

      // Update payment status
      payment.status = 'disputed';
      payment.dispute = dispute._id;
      await payment.save();

      // Notify relevant parties
      await Promise.all([
        // Email tenant
        sendEmail(payment.tenant.email, {
          template: 'paymentDispute',
          data: {
            paymentAmount: payment.amount,
            propertyName: payment.property.name,
            disputeReason: reason,
            nextSteps: 'We will review your dispute and get back to you within 48 hours.'
          }
        }),
        // Email property manager/owner
        sendEmail(payment.property.owner.email, {
          template: 'paymentDisputeNotification',
          data: {
            tenantName: payment.tenant.name,
            paymentAmount: payment.amount,
            propertyName: payment.property.name,
            disputeReason: reason
          }
        }),
        // SMS notification
        sendSMS(payment.tenant.phone, 
          `Your payment dispute for KES ${payment.amount} has been received. We'll review and respond within 48hrs. Dispute ID: ${dispute._id}`
        )
      ]);

      res.json({
        success: true,
        dispute
      });
    } catch (error) {
      console.error('Payment Dispute Error:', error);
      res.status(500).json({
        error: 'Failed to process payment dispute'
      });
    }
  },

  // Schedule recurring payments
  async scheduleRecurringPayment(req, res) {
    try {
      const {
        propertyId,
        tenantId,
        amount,
        frequency,
        startDate,
        endDate,
        paymentMethod
      } = req.body;

      // Validate dates
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : null;

      if (end && end < start) {
        return res.status(400).json({
          error: 'Invalid date range'
        });
      }

      // Create recurring payment schedule
      const recurringPayment = await RecurringPaymentModel.create({
        property: propertyId,
        tenant: tenantId,
        amount,
        frequency,
        startDate: start,
        endDate: end,
        paymentMethod,
        status: 'active'
      });

      // Schedule first payment
      await scheduleNextPayment(recurringPayment);

      // Notify tenant
      await sendEmail(tenant.email, {
        template: 'recurringPaymentSetup',
        data: {
          amount,
          frequency,
          startDate: start.toLocaleDateString(),
          endDate: end ? end.toLocaleDateString() : 'Until cancelled',
          paymentMethod
        }
      });

      res.json({
        success: true,
        recurringPayment
      });
    } catch (error) {
      console.error('Recurring Payment Setup Error:', error);
      res.status(500).json({
        error: 'Failed to set up recurring payment'
      });
    }
  },

  // Generate payment reminders
  async generatePaymentReminders(req, res) {
    try {
      const { propertyId } = req.params;
      const { reminderType } = req.query;

      // Get all active leases for the property
      const leases = await LeaseModel.find({
        property: propertyId,
        status: 'active'
      }).populate('tenant');

      const reminders = [];
      const now = new Date();

      for (const lease of leases) {
        // Check if rent is due soon or overdue
        const dueDate = new Date(lease.nextPaymentDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        if (
          (reminderType === 'upcoming' && daysUntilDue > 0 && daysUntilDue <= 5) ||
          (reminderType === 'overdue' && daysUntilDue < 0)
        ) {
          // Create reminder
          const reminder = await PaymentReminderModel.create({
            lease: lease._id,
            tenant: lease.tenant._id,
            property: propertyId,
            dueDate,
            amount: lease.monthlyRent,
            type: reminderType,
            status: 'pending'
          });

          // Send notifications
          await Promise.all([
            sendEmail(lease.tenant.email, {
              template: reminderType === 'upcoming' ? 'upcomingPaymentReminder' : 'overduePaymentReminder',
              data: {
                tenantName: lease.tenant.name,
                propertyName: lease.property.name,
                amount: lease.monthlyRent,
                dueDate: dueDate.toLocaleDateString(),
                daysUntilDue: Math.abs(daysUntilDue)
              }
            }),
            sendSMS(lease.tenant.phone,
              reminderType === 'upcoming'
                ? `Reminder: Your rent payment of KES ${lease.monthlyRent} is due in ${daysUntilDue} days. Please ensure timely payment to avoid late fees.`
                : `Your rent payment of KES ${lease.monthlyRent} is overdue by ${Math.abs(daysUntilDue)} days. Please make the payment immediately to avoid additional charges.`
            )
          ]);

          reminders.push(reminder);
        }
      }

      res.json({
        success: true,
        reminders
      });
    } catch (error) {
      console.error('Payment Reminder Error:', error);
      res.status(500).json({
        error: 'Failed to generate payment reminders'
      });
    }
  }
};

// Helper function to generate forecasts
async function generateForecasts(propertyId, metrics, payments, expenses) {
  // Implementation of forecasting logic
  // This could use machine learning models or statistical analysis
  // For now, using a simple trend-based forecast
  
  const forecasts = {
    revenue: [],
    expenses: [],
    occupancy: []
  };

  // Calculate trends
  const revenueGrowth = calculateGrowthRate(payments);
  const expenseGrowth = calculateGrowthRate(expenses);
  
  // Generate 6-month forecasts
  for (let i = 1; i <= 6; i++) {
    forecasts.revenue.push({
      month: i,
      amount: metrics.totalRevenue * Math.pow(1 + revenueGrowth, i)
    });
    
    forecasts.expenses.push({
      month: i,
      amount: metrics.totalExpenses * Math.pow(1 + expenseGrowth, i)
    });
    
    forecasts.occupancy.push({
      month: i,
      rate: Math.min(100, metrics.occupancyRate * Math.pow(1.02, i))
    });
  }

  return forecasts;
}

// Helper function to calculate growth rate
function calculateGrowthRate(items) {
  if (items.length < 2) return 0.02; // Default 2% growth if not enough data
  
  const sorted = items.sort((a, b) => a.createdAt - b.createdAt);
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  
  const monthsDiff = (newest.createdAt - oldest.createdAt) / (1000 * 60 * 60 * 24 * 30);
  if (monthsDiff === 0) return 0.02;
  
  const growth = (newest.amount - oldest.amount) / oldest.amount;
  return growth / monthsDiff;
}

module.exports = financialController;