const Transaction = require('../models/Transaction');
const Property = require('../models/Property');
const Lease = require('../models/Lease');
const Tenant = require('../models/Tenant');
const Maintenance = require('../models/Maintenance');

class ReportsService {
    /**
     * Generate Income Statement report
     * @param {Object} params - { landlordId, startDate, endDate }
     * @returns {Promise<Object>}
     */
    async generateIncomeStatement(params) {
        const { landlordId, startDate, endDate } = params;

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Get all transactions in date range
        const transactions = await Transaction.find({
            landlord: landlordId,
            createdAt: { $gte: start, $lte: end },
            status: 'completed'
        });

        // Calculate income
        const rentIncome = transactions
            .filter(t => t.type === 'rent')
            .reduce((sum, t) => sum + t.amount, 0);

        const otherIncome = transactions
            .filter(t => t.type !== 'rent' && t.category === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalIncome = rentIncome + otherIncome;

        // Calculate expenses
        const maintenanceExpenses = await Maintenance.aggregate([
            {
                $match: {
                    landlord: landlordId,
                    createdAt: { $gte: start, $lte: end },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$cost' }
                }
            }
        ]);

        const maintenanceCost = maintenanceExpenses[0]?.total || 0;

        const otherExpenses = transactions
            .filter(t => t.category === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpenses = maintenanceCost + otherExpenses;

        // Calculate profit
        const netIncome = totalIncome - totalExpenses;
        const profitMargin = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

        return {
            reportType: 'income_statement',
            period: { startDate, endDate },
            income: {
                rentIncome,
                otherIncome,
                total: totalIncome
            },
            expenses: {
                maintenance: maintenanceCost,
                other: otherExpenses,
                total: totalExpenses
            },
            netIncome,
            profitMargin: Math.round(profitMargin * 100) / 100,
            generatedAt: new Date()
        };
    }

    /**
     * Generate Property Performance report
     * @param {Object} params - { landlordId, propertyId, startDate, endDate }
     * @returns {Promise<Object>}
     */
    async generatePropertyPerformance(params) {
        const { landlordId, propertyId, startDate, endDate } = params;

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Get property details
        const property = await Property.findOne({
            _id: propertyId,
            landlord: landlordId
        }).populate('units');

        if (!property) {
            throw new Error('Property not found');
        }

        // Get leases for this property
        const leases = await Lease.find({
            property: propertyId,
            $or: [
                { startDate: { $lte: end }, endDate: { $gte: start } },
                { startDate: { $lte: end }, endDate: null }
            ]
        });

        // Calculate occupancy
        const totalUnits = property.units?.length || property.totalUnits || 1;
        const occupiedUnits = leases.filter(l => l.status === 'active').length;
        const occupancyRate = (occupiedUnits / totalUnits) * 100;

        // Get rent collected
        const rentCollected = await Transaction.aggregate([
            {
                $match: {
                    property: propertyId,
                    type: 'rent',
                    status: 'completed',
                    createdAt: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const totalRent = rentCollected[0]?.total || 0;
        const rentTransactions = rentCollected[0]?.count || 0;

        // Get maintenance costs
        const maintenanceCosts = await Maintenance.aggregate([
            {
                $match: {
                    property: propertyId,
                    createdAt: { $gte: start, $lte: end },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$cost' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const totalMaintenance = maintenanceCosts[0]?.total || 0;
        const maintenanceRequests = maintenanceCosts[0]?.count || 0;

        // Calculate ROI
        const propertyValue = property.purchasePrice || property.value || 0;
        const netProfit = totalRent - totalMaintenance;
        const roi = propertyValue > 0 ? (netProfit / propertyValue) * 100 : 0;

        // Calculate rent collection rate
        const expectedRent = property.rent * totalUnits *
            Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30));
        const collectionRate = expectedRent > 0 ? (totalRent / expectedRent) * 100 : 0;

        return {
            reportType: 'property_performance',
            period: { startDate, endDate },
            property: {
                id: property._id,
                name: property.name,
                address: property.address,
                totalUnits
            },
            occupancy: {
                occupiedUnits,
                totalUnits,
                rate: Math.round(occupancyRate * 100) / 100
            },
            financial: {
                rentCollected: totalRent,
                rentTransactions,
                maintenanceCosts: totalMaintenance,
                maintenanceRequests,
                netProfit,
                roi: Math.round(roi * 100) / 100,
                collectionRate: Math.round(collectionRate * 100) / 100
            },
            generatedAt: new Date()
        };
    }

    /**
     * Generate Rent Roll report
     * @param {Object} params - { landlordId, propertyId }
     * @returns {Promise<Object>}
     */
    async generateRentRoll(params) {
        const { landlordId, propertyId } = params;

        // Build query
        const query = { landlord: landlordId };
        if (propertyId) {
            query.property = propertyId;
        }

        // Get all active leases
        const leases = await Lease.find({
            ...query,
            status: { $in: ['active', 'pending'] }
        })
            .populate('tenant', 'name email phone')
            .populate('property', 'name address')
            .populate('unit', 'unitNumber')
            .sort({ property: 1, unit: 1 });

        // Get payment status for each lease
        const rentRollData = await Promise.all(
            leases.map(async (lease) => {
                // Get recent payments
                const recentPayments = await Transaction.find({
                    lease: lease._id,
                    type: 'rent',
                    createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
                }).sort({ createdAt: -1 });

                const lastPayment = recentPayments[0];
                const totalPaid = recentPayments
                    .filter(p => p.status === 'completed')
                    .reduce((sum, p) => sum + p.amount, 0);

                // Calculate arrears
                const monthsSinceStart = Math.ceil(
                    (Date.now() - new Date(lease.startDate).getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                );
                const expectedPayments = lease.rent * monthsSinceStart;
                const arrears = Math.max(0, expectedPayments - totalPaid);

                return {
                    tenant: {
                        name: lease.tenant?.name,
                        email: lease.tenant?.email,
                        phone: lease.tenant?.phone
                    },
                    property: {
                        name: lease.property?.name,
                        address: lease.property?.address
                    },
                    unit: lease.unit?.unitNumber || 'N/A',
                    lease: {
                        startDate: lease.startDate,
                        endDate: lease.endDate,
                        rent: lease.rent,
                        deposit: lease.deposit,
                        status: lease.status
                    },
                    payment: {
                        lastPaymentDate: lastPayment?.createdAt,
                        lastPaymentAmount: lastPayment?.amount || 0,
                        totalPaid,
                        arrears,
                        status: arrears > 0 ? 'overdue' : 'current'
                    }
                };
            })
        );

        // Calculate summary
        const summary = {
            totalUnits: rentRollData.length,
            totalMonthlyRent: rentRollData.reduce((sum, r) => sum + r.lease.rent, 0),
            totalArrears: rentRollData.reduce((sum, r) => sum + r.payment.arrears, 0),
            occupiedUnits: rentRollData.filter(r => r.lease.status === 'active').length,
            pendingUnits: rentRollData.filter(r => r.lease.status === 'pending').length
        };

        return {
            reportType: 'rent_roll',
            generatedAt: new Date(),
            summary,
            rentRoll: rentRollData
        };
    }

    /**
     * Get all available reports for a landlord
     * @param {String} landlordId 
     * @returns {Promise<Array>}
     */
    async getAvailableReports(landlordId) {
        return [
            {
                id: 'income_statement',
                name: 'Income Statement',
                description: 'Revenue, expenses, and profit analysis',
                requiresDateRange: true
            },
            {
                id: 'property_performance',
                name: 'Property Performance',
                description: 'Occupancy, ROI, and financial metrics',
                requiresDateRange: true,
                requiresProperty: true
            },
            {
                id: 'rent_roll',
                name: 'Rent Roll',
                description: 'Tenant list with payment status',
                requiresDateRange: false
            }
        ];
    }
}

module.exports = new ReportsService();
