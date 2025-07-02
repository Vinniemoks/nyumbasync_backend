const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { formatKenyanDate } = require('../utils/formatters');

class DocumentService {
  async generateLeasePDF(leaseId) {
    const lease = await Lease.findById(leaseId)
      .populate('property')
      .populate('tenant')
      .populate('landlord');

    const doc = new PDFDocument();
    const filePath = path.join(__dirname, `../../leases/${leaseId}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Kenyan lease header
    doc.image('assets/kenya-flag.png', 50, 45, { width: 50 });
    doc.fontSize(20).text('RENTAL AGREEMENT', 110, 57);
    doc.fontSize(8).text(`Under Kenyan Rental Act ${new Date().getFullYear()}`, 110, 85);

    // Parties section
    doc.fontSize(12).text('PARTIES:', 50, 130);
    doc.text(`1. LANDLORD: ${lease.landlord.name} (KRA PIN: ${lease.landlord.kraPin || 'Not provided'})`, 50, 150);
    doc.text(`2. TENANT: ${lease.tenant.name} (ID: ${lease.tenant.idNumber})`, 50, 165);

    // Property details
    doc.text(`PROPERTY: ${lease.property.location} in ${lease.property.subcounty} Subcounty`, 50, 200);

    // Kenyan standard clauses
    this._addKenyanClauses(doc, lease);

    // Signatures
    doc.text('LANDLORD SIGNATURE: ________________________', 50, 600);
    doc.text('TENANT SIGNATURE: ________________________', 50, 630);
    doc.text(`WITNESSED ON: ${formatKenyanDate(new Date())}`, 50, 660);

    doc.end();

    return filePath;
  }

  _addKenyanClauses(doc, lease) {
    const clauses = [
      `1. Rent Amount: KES ${lease.terms.rentAmount} payable monthly`,
      `2. Deposit: KES ${lease.terms.depositAmount} (${lease.terms.depositAmount / lease.terms.rentAmount} months rent)`,
      '3. Termination Notice:',
      `   - Landlord: ${lease.terms.terminationNotice} months`,
      `   - Tenant: ${Math.max(1, lease.terms.terminationNotice - 1)} month`,
      '4. Water rationing schedule applies during shortages',
      '5. Disputes to be handled through Nairobi Rent Tribunal'
    ];

    doc.text('TERMS AND CONDITIONS:', 50, 250);
    clauses.forEach((clause, i) => {
      doc.text(clause, 50, 280 + (i * 20));
    });
  }
}

module.exports = new DocumentService();
