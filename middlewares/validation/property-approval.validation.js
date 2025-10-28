const Joi = require('joi');

const documentTypes = [
  'title_deed',
  'ownership_cert', 
  'insurance',
  'inspection_report',
  'tax_compliance',
  'permits',
  'utility_bills'
];

const inspectionTypes = [
  'initial',
  'routine',
  'compliance',
  'complaint',
  'follow_up'
];

const complianceTypes = [
  'zoning',
  'safety',
  'structural',
  'environmental',
  'accessibility',
  'utilities'
];

const validationSchemas = {
  submitApproval: Joi.object({
    propertyId: Joi.string().required(),
    documents: Joi.array().items(
      Joi.object({
        type: Joi.string().valid(...documentTypes).required(),
        url: Joi.string().uri().required()
      })
    ).min(1).required()
  }),

  reviewApproval: Joi.object({
    status: Joi.string().valid('approved', 'rejected', 'suspended').required(),
    notes: Joi.string().max(1000),
    complianceChecks: Joi.array().items(
      Joi.object({
        type: Joi.string().valid(...complianceTypes).required(),
        status: Joi.string().valid('pending', 'passed', 'failed').required(),
        notes: Joi.string().max(500)
      })
    ),
    documents: Joi.array().items(
      Joi.object({
        _id: Joi.string().required(),
        verified: Joi.boolean().required(),
        status: Joi.string().valid('pending', 'verified', 'rejected', 'expired').required(),
        expiryDate: Joi.date().greater('now'),
        notes: Joi.string().max(500)
      })
    )
  }),

  scheduleInspection: Joi.object({
    type: Joi.string().valid(...inspectionTypes).required(),
    date: Joi.date().greater('now').required(),
    inspector: Joi.string().required() // User ID of inspector
  }),

  completeInspection: Joi.object({
    findings: Joi.array().items(
      Joi.object({
        category: Joi.string().valid('structural', 'safety', 'utilities', 'maintenance', 'compliance').required(),
        description: Joi.string().required(),
        severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
        status: Joi.string().valid('open', 'in_progress', 'resolved').required()
      })
    ),
    rating: Joi.number().min(1).max(5).required(),
    images: Joi.array().items(
      Joi.object({
        url: Joi.string().uri().required(),
        description: Joi.string()
      })
    ),
    status: Joi.string().valid('completed', 'in_progress').required()
  })
};

const validatePropertyApproval = (req, res, next) => {
  const { path } = req.route;
  let schema;

  // Determine which validation schema to use based on the route
  if (path.endsWith('/submit')) {
    schema = validationSchemas.submitApproval;
  } else if (path.includes('/review')) {
    schema = validationSchemas.reviewApproval;
  } else if (path.includes('/inspections') && req.method === 'POST') {
    schema = validationSchemas.scheduleInspection;
  } else if (path.includes('/inspections') && req.method === 'PUT') {
    schema = validationSchemas.completeInspection;
  }

  if (!schema) {
    return next();
  }

  const { error } = schema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

module.exports = {
  validatePropertyApproval,
  validationSchemas // Export for testing
};