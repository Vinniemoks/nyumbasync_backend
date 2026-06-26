const Property = require('../models/property.model');
const Tenant = require('../models/tenant.model');
const Lease = require('../models/lease.model');
const Payment = require('../models/payment.model');
const Maintenance = require('../models/maintenance.model');
const Expense = require('../models/expense.model');
const { formatDate, formatCurrency } = require('../utils/helpers');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

class ReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureReportsDirectoryExists();
  }

  ensureReportsDirectoryExists() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate financial report for a property or portfolio
   * @param {Object} params - Report parameters
   * @param {string} params.ownerId - Property owner ID
   * @param {string} [params.propertyId] - Specific property ID (optional)
   * @param {Date} params.startDate - Report start date
   * @param {Date} params.endDate - Report end date
   * @param {string} [params.format='pdf'] - Report format (pdf or excel)
   * @returns {Promise<Object>} - Report generation result
   */
  async generateFinancialReport(params) {
    try {
      const { ownerId, propertyId, startDate, endDate, format = 'pdf' } = params;
      
      // Get properties data
      const query = { owner: ownerId };
      if (propertyId) query._id = propertyId;
      
      const properties = await Property.find(query).lean();
      if (!properties.length) {
        throw new Error('No properties found for this owner');
      }

      // Get all payments and expenses for the period
      const paymentPromises = properties.map(prop => 
        Payment.find({
          property: prop._id,
          paymentDate: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }).lean()
      );

      const expensePromises = properties.map(prop => 
        Expense.find({
          property: prop._id,
          date: { $gte: startDate, $lte: endDate }
        }).lean()
      );

      const payments = (await Promise.all(paymentPromises)).flat();
      const expenses = (await Promise.all(expensePromises)).flat();

      // Calculate totals
      const totalIncome = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const netProfit = totalIncome - totalExpenses;

      // Prepare report data
      const reportData = {
        title: propertyId ? 'Property Financial Report' : 'Portfolio Financial Report',
        period: `${formatDate(startDate)} to ${formatDate(endDate)}`,
        properties: properties.map(prop => ({
          name: prop.name,
          address: prop.address,
          income: payments
            .filter(p => p.property.toString() === prop._id.toString())
            .reduce((sum, p) => sum + p.amount, 0),
          expenses: expenses
            .filter(e => e.property.toString() === prop._id.toString())
            .reduce((sum, e) => sum + e.amount, 0)
        })),
        summary: {
          totalIncome,
          totalExpenses,
          netProfit
        },
        payments: payments.map(p => ({
          ...p,
          formattedDate: formatDate(p.paymentDate),
          formattedAmount: formatCurrency(p.amount)
        })),
        expenses: expenses.map(e => ({
          ...e,
          formattedDate: formatDate(e.date),
          formattedAmount: formatCurrency(e.amount)
        }))
      };

      // Generate in requested format
      if (format === 'excel') {
        return this.generateExcelFinancialReport(reportData);
      } else {
        return this.generatePDFFinancialReport(reportData);
      }
    } catch (error) {
      console.error('Error generating financial report:', error);
      throw error;
    }
  }

  /**
   * Generate PDF financial report
   * @param {Object} reportData - Prepared report data
   * @returns {Promise<Object>} - Report file information
   */
  async generatePDFFinancialReport(reportData) {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `financial_report_${Date.now()}.pdf`;
        const filePath = path.join(this.reportsDir, fileName);
        const doc = new PDFDocument({ margin: 50 });

        // Pipe PDF to file
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Add report header
        this.addPDFHeader(doc, reportData.title, reportData.period);

        // Add property summaries
        doc.fontSize(14).text('Property Summaries', { underline: true });
        doc.moveDown(0.5);

        reportData.properties.forEach(property => {
          doc.fontSize(12)
            .text(`${property.name} - ${property.address}`, { continued: true })
            .text(`Income: ${formatCurrency(property.income)}`, { align: 'right' });
          
          doc.text(`Expenses: ${formatCurrency(property.expenses)}`, { align: 'right' });
          doc.text(`Net: ${formatCurrency(property.income - property.expenses)}`, 
            { align: 'right', color: (property.income - property.expenses) >= 0 ? 'green' : 'red' });
          
          doc.moveDown();
        });

        // Add summary section
        doc.addPage();
        doc.fontSize(14).text('Financial Summary', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(12)
          .text(`Total Income: ${formatCurrency(reportData.summary.totalIncome)}`, { align: 'right' })
          .text(`Total Expenses: ${formatCurrency(reportData.summary.totalExpenses)}`, { align: 'right' })
          .text(`Net Profit: ${formatCurrency(reportData.summary.netProfit)}`, 
            { align: 'right', color: reportData.summary.netProfit >= 0 ? 'green' : 'red' });

        // Add payment details
        doc.addPage();
        doc.fontSize(14).text('Payment Details', { underline: true });
        doc.moveDown(0.5);

        reportData.payments.forEach(payment => {
          doc.fontSize(10)
            .text(`${payment.formattedDate} - ${payment.paymentFor || 'Payment'}`, { continued: true })
            .text(payment.formattedAmount, { align: 'right' });
          doc.moveDown(0.3);
        });

        // Add expense details
        doc.addPage();
        doc.fontSize(14).text('Expense Details', { underline: true });
        doc.moveDown(0.5);

        reportData.expenses.forEach(expense => {
          doc.fontSize(10)
            .text(`${expense.formattedDate} - ${expense.category}`, { continued: true })
            .text(expense.formattedAmount, { align: 'right' });
          doc.moveDown(0.3);
        });

        // Finalize PDF
        doc.end();

        stream.on('finish', () => {
          resolve({
            success: true,
            filePath,
            fileName,
            mimeType: 'application/pdf'
          });
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate Excel financial report
   * @param {Object} reportData - Prepared report data
   * @returns {Promise<Object>} - Report file information
   */
  async generateExcelFinancialReport(reportData) {
    try {
      const fileName = `financial_report_${Date.now()}.xlsx`;
      const filePath = path.join(this.reportsDir, fileName);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Financial Report');

      // Add title and period
      worksheet.mergeCells('A1:D1');
      worksheet.getCell('A1').value = reportData.title;
      worksheet.getCell('A1').font = { bold: true, size: 16 };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `Period: ${reportData.period}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' };
      worksheet.addRow([]);

      // Add property summaries
      worksheet.addRow(['Property', 'Address', 'Income', 'Expenses', 'Net']);
      worksheet.lastRow.eachCell(cell => {
        cell.font = { bold: true };
      });

      reportData.properties.forEach(prop => {
        const net = prop.income - prop.expenses;
        const row = worksheet.addRow([
          prop.name,
          prop.address,
          prop.income,
          prop.expenses,
          { formula: `C${worksheet.lastRow.number}-D${worksheet.lastRow.number}` }
        ]);

        row.getCell(5).font = { color: { argb: net >= 0 ? 'FF00AA00' : 'FFFF0000' } };
      });

      // Add summary section
      worksheet.addRow([]);
      worksheet.addRow(['Financial Summary']);
      worksheet.lastRow.getCell(1).font = { bold: true, size: 14 };

      worksheet.addRow(['Total Income', reportData.summary.totalIncome]);
      worksheet.addRow(['Total Expenses', reportData.summary.totalExpenses]);
      worksheet.addRow([
        'Net Profit', 
        { 
          formula: `B${worksheet.lastRow.number-2}-B${worksheet.lastRow.number-1}`,
          font: { 
            color: { 
              argb: reportData.summary.netProfit >= 0 ? 'FF00AA00' : 'FFFF0000' 
            } 
          }
        }
      ]);

      // Add payment details sheet
      const paymentsSheet = workbook.addWorksheet('Payments');
      paymentsSheet.addRow(['Date', 'Description', 'Amount', 'Property']);
      paymentsSheet.lastRow.eachCell(cell => {
        cell.font = { bold: true };
      });

      reportData.payments.forEach(p => {
        const property = reportData.properties.find(prop => 
          prop._id.toString() === p.property.toString()
        );
        paymentsSheet.addRow([
          p.formattedDate,
          p.paymentFor || 'Payment',
          p.amount,
          property?.name || ''
        ]);
      });

      // Add expense details sheet
      const expensesSheet = workbook.addWorksheet('Expenses');
      expensesSheet.addRow(['Date', 'Category', 'Description', 'Amount', 'Property']);
      expensesSheet.lastRow.eachCell(cell => {
        cell.font = { bold: true };
      });

      reportData.expenses.forEach(e => {
        const property = reportData.properties.find(prop => 
          prop._id.toString() === e.property.toString()
        );
        expensesSheet.addRow([
          e.formattedDate,
          e.category,
          e.description,
          e.amount,
          property?.name || ''
        ]);
      });

      // Save workbook
      await workbook.xlsx.writeFile(filePath);

      return {
        success: true,
        filePath,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
    } catch (error) {
      console.error('Error generating Excel report:', error);
      throw error;
    }
  }

  /**
   * Generate occupancy report
   * @param {Object} params - Report parameters
   * @param {string} params.ownerId - Property owner ID
   * @param {string} [params.format='pdf'] - Report format (pdf or excel)
   * @returns {Promise<Object>} - Report generation result
   */
  async generateOccupancyReport(params) {
    try {
      const { ownerId, format = 'pdf' } = params;
      
      // Get properties and their leases
      const properties = await Property.find({ owner: ownerId }).lean();
      if (!properties.length) {
        throw new Error('No properties found for this owner');
      }

      const leases = await Lease.find({
        property: { $in: properties.map(p => p._id) }
      }).populate('tenant property').lean();

      // Prepare report data
      const reportData = {
        title: 'Property Occupancy Report',
        generatedDate: formatDate(new Date()),
        properties: properties.map(prop => {
          const propertyLeases = leases.filter(l => 
            l.property._id.toString() === prop._id.toString()
          );
          
          return {
            name: prop.name,
            address: prop.address,
            totalUnits: prop.units?.length || 1,
            occupiedUnits: propertyLeases.filter(l => 
              new Date(l.endDate) >= new Date() && new Date(l.startDate) <= new Date()
            ).length,
            leases: propertyLeases.map(l => ({
              tenant: l.tenant.name,
              unit: l.unit || 'N/A',
              startDate: formatDate(l.startDate),
              endDate: formatDate(l.endDate),
              status: new Date(l.endDate) >= new Date() ? 'Active' : 'Expired',
              rentAmount: formatCurrency(l.rentAmount)
            }))
          };
        })
      };

      // Generate in requested format
      if (format === 'excel') {
        return this.generateExcelOccupancyReport(reportData);
      } else {
        return this.generatePDFOccupancyReport(reportData);
      }
    } catch (error) {
      console.error('Error generating occupancy report:', error);
      throw error;
    }
  }

  // Similar PDF and Excel generation methods for occupancy report would be here
  // (Implementation would follow similar patterns as the financial report methods)

  /**
   * Generate maintenance report
   * @param {Object} params - Report parameters
   * @param {string} params.ownerId - Property owner ID
   * @param {string} [params.propertyId] - Specific property ID (optional)
   * @param {Date} params.startDate - Report start date
   * @param {Date} params.endDate - Report end date
   * @param {string} [params.format='pdf'] - Report format (pdf or excel)
   * @returns {Promise<Object>} - Report generation result
   */
  async generateMaintenanceReport(params) {
    try {
      const { ownerId, propertyId, startDate, endDate, format = 'pdf' } = params;
      
      // Get properties data
      const query = { owner: ownerId };
      if (propertyId) query._id = propertyId;
      
      const properties = await Property.find(query).lean();
      if (!properties.length) {
        throw new Error('No properties found for this owner');
      }

      // Get maintenance requests for the period
      const maintenanceRequests = await Maintenance.find({
        property: { $in: properties.map(p => p._id) },
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('property tenant').lean();

      // Prepare report data
      const reportData = {
        title: propertyId ? 'Property Maintenance Report' : 'Portfolio Maintenance Report',
        period: `${formatDate(startDate)} to ${formatDate(endDate)}`,
        properties: properties.map(prop => ({
          name: prop.name,
          address: prop.address,
          totalRequests: maintenanceRequests.filter(m => 
            m.property._id.toString() === prop._id.toString()
          ).length,
          completedRequests: maintenanceRequests.filter(m => 
            m.property._id.toString() === prop._id.toString() && 
            m.status === 'completed'
          ).length
        })),
        requests: maintenanceRequests.map(m => ({
          id: m.requestId,
          property: m.property.name,
          unit: m.unit || 'N/A',
          category: m.category,
          priority: m.priority,
          status: m.status,
          createdAt: formatDate(m.createdAt),
          completedAt: m.completedAt ? formatDate(m.completedAt) : 'N/A',
          cost: m.cost ? formatCurrency(m.cost) : 'N/A'
        }))
      };

      // Generate in requested format
      if (format === 'excel') {
        return this.generateExcelMaintenanceReport(reportData);
      } else {
        return this.generatePDFMaintenanceReport(reportData);
      }
    } catch (error) {
      console.error('Error generating maintenance report:', error);
      throw error;
    }
  }

  // Similar PDF and Excel generation methods for maintenance report would be here

  /**
   * Helper method to add header to PDF reports
   * @param {PDFDocument} doc - PDF document instance
   * @param {string} title - Report title
   * @param {string} subtitle - Report subtitle/period
   */
  addPDFHeader(doc, title, subtitle) {
    doc.image(path.join(__dirname, '../assets/logo.png'), 50, 45, { width: 50 });
    doc
      .fontSize(20)
      .text(title, 110, 57)
      .fontSize(10)
      .text(subtitle, 110, 77)
      .moveDown(2);
  }
}

module.exports = new ReportService();