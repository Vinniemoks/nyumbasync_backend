const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/invoice.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Landlord: bulk-generate the current month's invoices for active leases.
router.post('/generate',
  authenticate('landlord'),
  invoiceController.generateInvoices
);

// Tenant or landlord: list own invoices (role-aware in the controller).
router.get('/',
  authenticate(['tenant', 'landlord']),
  invoiceController.listInvoices
);

// Single invoice (access-checked in controller).
router.get('/:id',
  authenticate(['tenant', 'landlord']),
  invoiceController.getInvoice
);

// Downloadable PDF (access-checked in controller).
router.get('/:id/pdf',
  authenticate(['tenant', 'landlord']),
  invoiceController.downloadInvoicePdf
);

// Landlord: (re)send the invoice email.
router.post('/:id/send',
  authenticate('landlord'),
  invoiceController.sendInvoice
);

// Landlord: add water/service line items to a draft, issue it, or remind the tenant.
router.post('/:id/line-items',
  authenticate('landlord'),
  invoiceController.addLineItems
);
router.post('/:id/issue',
  authenticate('landlord'),
  invoiceController.issueInvoice
);
router.post('/:id/remind',
  authenticate('landlord'),
  invoiceController.remindInvoice
);

module.exports = router;
