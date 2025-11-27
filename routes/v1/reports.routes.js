const express = require('express');
const router = express.Router();
const reportsService = require('../../services/reportsService');
const { authenticate } = require('../../middleware/auth');

/**
 * @route   GET /api/v1/reports/available
 * @desc    Get list of available reports
 * @access  Private (Landlord)
 */
router.get('/available', authenticate(['landlord']), async (req, res) => {
    try {
        const reports = await reportsService.getAvailableReports(req.user.id);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching available reports:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   POST /api/v1/reports/generate
 * @desc    Generate a report
 * @access  Private (Landlord)
 */
router.post('/generate', authenticate(['landlord']), async (req, res) => {
    try {
        const { reportType, startDate, endDate, propertyId } = req.body;

        if (!reportType) {
            return res.status(400).json({ message: 'Report type is required' });
        }

        const params = {
            landlordId: req.user.id,
            startDate,
            endDate,
            propertyId
        };

        let report;

        switch (reportType) {
            case 'income_statement':
                if (!startDate || !endDate) {
                    return res.status(400).json({ message: 'Start and end dates are required' });
                }
                report = await reportsService.generateIncomeStatement(params);
                break;

            case 'property_performance':
                if (!startDate || !endDate || !propertyId) {
                    return res.status(400).json({
                        message: 'Start date, end date, and property ID are required'
                    });
                }
                report = await reportsService.generatePropertyPerformance(params);
                break;

            case 'rent_roll':
                report = await reportsService.generateRentRoll(params);
                break;

            default:
                return res.status(400).json({ message: 'Invalid report type' });
        }

        res.json(report);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

/**
 * @route   POST /api/v1/reports/export/pdf
 * @desc    Export report as PDF
 * @access  Private (Landlord)
 */
router.post('/export/pdf', authenticate(['landlord']), async (req, res) => {
    try {
        const { reportData } = req.body;

        if (!reportData) {
            return res.status(400).json({ message: 'Report data is required' });
        }

        // TODO: Implement PDF generation
        // For now, return success message
        res.json({
            message: 'PDF export coming soon',
            format: 'pdf'
        });
    } catch (error) {
        console.error('Error exporting PDF:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   POST /api/v1/reports/export/excel
 * @desc    Export report as Excel
 * @access  Private (Landlord)
 */
router.post('/export/excel', authenticate(['landlord']), async (req, res) => {
    try {
        const { reportData } = req.body;

        if (!reportData) {
            return res.status(400).json({ message: 'Report data is required' });
        }

        // TODO: Implement Excel generation
        // For now, return success message
        res.json({
            message: 'Excel export coming soon',
            format: 'excel'
        });
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
