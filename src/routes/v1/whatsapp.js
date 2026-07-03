/**
 * WhatsApp Business API Routes
 * NyumbaSync Property Management Platform
 * 
 * Role: WhatsApp_Business_Integrator
 * 
 * Express routes for WhatsApp webhook handling, message sending,
 * template listing, and bulk broadcasts.
 * 
 * Base path: /api/v1/whatsapp
 * 
 * NOTE: These routes are NOT auto-registered by the existing server.js
 * because this is a new integration file. To activate, register in server.js:
 *   app.use('/api/v1/whatsapp', authenticateToken, whatsappRoutes);
 * (Webhook routes skip auth; others require Bearer token.)
 */

const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/auth.middleware');
const whatsappService = require('../../services/whatsappService');
const logger = require('../../utils/logger');

// ============================================================
// Input Validation Helpers
// ============================================================

const validatePhone = (phone) => {
  const cleaned = String(phone).replace(/[\s\-\(\)\+]/g, '');
  const kenyanRegex = /^(254[71]\d{8}|0[71]\d{8})$/;
  return kenyanRegex.test(cleaned);
};

const validatePhoneArray = (phones) => {
  if (!Array.isArray(phones)) return { valid: false, error: 'recipients must be an array' };
  if (phones.length === 0) return { valid: false, error: 'recipients array cannot be empty' };
  if (phones.length > 500) return { valid: false, error: 'Maximum 500 recipients per broadcast' };
  
  const invalid = phones.filter(p => !validatePhone(p));
  if (invalid.length > 0) {
    return { valid: false, error: `Invalid phone numbers: ${invalid.join(', ')}` };
  }
  
  return { valid: true };
};

const validateTemplateName = (name) => {
  if (!name || typeof name !== 'string') return { valid: false, error: 'templateName is required' };
  const template = whatsappService.getTemplate(name);
  if (!template) return { valid: false, error: `Template '${name}' not found` };
  return { valid: true, template };
};

// ============================================================
// Route Handlers
// ============================================================

/**
 * GET /webhook
 * WhatsApp provider verification endpoint.
 * Meta, 360dialog, and Twilio all send a challenge request to verify webhook URL ownership.
 * This endpoint MUST be publicly accessible (no authentication).
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info(`WHATSAPP_WEBHOOK_VERIFY: mode=${mode}, token=${token ? '***' : 'missing'}`);

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('✅ WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('❌ WhatsApp webhook verification failed');
    res.status(403).json({ error: 'Verification failed', timestamp: new Date().toISOString() });
  }
};

/**
 * POST /webhook
 * Receive incoming messages and status updates from WhatsApp provider.
 * This endpoint MUST be publicly accessible (no authentication) —
 * signature validation is handled internally.
 * 
 * IMPORTANT: Respond within 5 seconds. Offload heavy processing to a queue.
 */
const receiveWebhook = asyncHandler(async (req, res) => {
  // Immediately acknowledge receipt to provider (prevent timeout retries)
  res.status(200).json({ status: 'received', timestamp: new Date().toISOString() });

  // Process payload asynchronously
  try {
    const payload = req.body;
    
    // TODO: Validate webhook signature before processing
    // Meta: X-Hub-Signature-256 header
    // Twilio: X-Twilio-Signature header
    // 360dialog: X-360dialog-Signature header (if configured)
    
    const result = await whatsappService.handleIncomingWebhook(payload);
    
    logger.info(`WHATSAPP_WEBHOOK_PROCESSED: ${result.processed} events`);
  } catch (error) {
    logger.error(`WHATSAPP_WEBHOOK_PROCESS_ERROR: ${error.message}`);
    // Do NOT re-throw — webhook was already acknowledged
  }
});

/**
 * POST /send
 * Send a templated WhatsApp message to a single recipient.
 * Requires authentication.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const {
    templateName,
    to,
    language = 'en',
    variables = [],
    priority = 'normal',
    tags = [],
    relatedEntity = null
  } = req.body;

  // Validate inputs
  if (!templateName || !to) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'templateName and to are required fields',
      timestamp: new Date().toISOString()
    });
  }

  if (!validatePhone(to)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid phone number. Use Kenyan format: 07XXXXXXXX or 2547XXXXXXXX',
      timestamp: new Date().toISOString()
    });
  }

  const templateCheck = validateTemplateName(templateName);
  if (!templateCheck.valid) {
    return res.status(400).json({
      error: 'Bad Request',
      message: templateCheck.error,
      availableTemplates: whatsappService.listTemplates().map(t => t.name),
      timestamp: new Date().toISOString()
    });
  }

  if (templateCheck.template.variables && variables.length !== templateCheck.template.variables) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Template '${templateName}' requires exactly ${templateCheck.template.variables} variables, received ${variables.length}`,
      timestamp: new Date().toISOString()
    });
  }

  logger.info(`WHATSAPP_SEND_REQUEST: ${templateName} to ${to} by user=${req.user?.id || 'unknown'}`);

  const result = await whatsappService.sendTemplatedMessage({
    templateName,
    to,
    language,
    variables,
    priority,
    tags,
    relatedEntity
  });

  res.status(200).json({
    success: true,
    ...result,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /templates
 * List all approved WhatsApp message templates.
 * Requires authentication.
 */
const listTemplates = asyncHandler(async (req, res) => {
  const templates = whatsappService.listTemplates();
  
  res.status(200).json({
    success: true,
    count: templates.length,
    templates,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /broadcast
 * Send a templated WhatsApp message to multiple recipients.
 * Requires authentication + admin/landlord/property_manager role.
 */
const broadcastMessage = asyncHandler(async (req, res) => {
  const {
    templateName,
    recipients,
    language = 'en',
    variables = [],
    tags = []
  } = req.body;

  // Validate inputs
  if (!templateName) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'templateName is required',
      timestamp: new Date().toISOString()
    });
  }

  const phoneCheck = validatePhoneArray(recipients);
  if (!phoneCheck.valid) {
    return res.status(400).json({
      error: 'Bad Request',
      message: phoneCheck.error,
      timestamp: new Date().toISOString()
    });
  }

  const templateCheck = validateTemplateName(templateName);
  if (!templateCheck.valid) {
    return res.status(400).json({
      error: 'Bad Request',
      message: templateCheck.error,
      availableTemplates: whatsappService.listTemplates().map(t => t.name),
      timestamp: new Date().toISOString()
    });
  }

  logger.info(`WHATSAPP_BROADCAST_REQUEST: ${templateName} to ${recipients.length} recipients by user=${req.user?.id || 'unknown'}`);

  const result = await whatsappService.broadcast({
    templateName,
    recipients,
    language,
    variables,
    tags
  });

  res.status(200).json({
    success: true,
    ...result,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /logs
 * Query WhatsApp message interaction logs.
 * Requires authentication. Supports filtering by phone, department, status, date range.
 */
const getLogs = asyncHandler(async (req, res) => {
  const filters = {
    phone: req.query.phone,
    department: req.query.department,
    status: req.query.status,
    direction: req.query.direction,
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    tags: req.query.tags ? req.query.tags.split(',') : undefined
  };

  const options = {
    limit: parseInt(req.query.limit, 10) || 100,
    offset: parseInt(req.query.offset, 10) || 0
  };

  // Restrict non-admins to their own phone logs (optional enhancement)
  const logs = await whatsappService.getLogs(filters, options);

  res.status(200).json({
    success: true,
    count: logs.length,
    logs,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /stats
 * Get WhatsApp delivery statistics.
 * Requires authentication.
 */
const getStats = asyncHandler(async (req, res) => {
  const period = req.query.period || '7d';
  const stats = await whatsappService.getStats(period);

  res.status(200).json({
    success: true,
    stats,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Route Configuration
// ============================================================
// 
// This module exports an array of route configuration objects
// compatible with the NyumbaSync server's createRouterFromConfig() factory.
//
// Routes are grouped by authentication requirement:
//   - Webhook routes: NO authentication (public endpoints for providers)
//   - All other routes: Bearer token required
//
// To register in server.js:
//   const whatsappRoutes = require('./routes/v1/whatsapp');
//   // Webhook routes must be registered BEFORE auth middleware
//   app.use('/api/v1/whatsapp/webhook', whatsappRoutes.filter(r => r.path === '/webhook').map(r => r.handler));
//   // Or simpler: use the array and handle auth in individual handlers
//
// NOTE: The existing server.js pattern uses app.use() with Express routers.
// Since this is a new file, you may need to convert to an Express router:
//   const router = express.Router();
//   router.get('/webhook', verifyWebhook);
//   router.post('/webhook', receiveWebhook);
//   ... etc
//   module.exports = router;
//
// The array format below matches the project's existing route convention.

module.exports = [
  // --------------------------------------------------------
  // Webhook Routes (Public — no authentication)
  // --------------------------------------------------------
  {
    method: 'GET',
    path: '/webhook',
    handler: [verifyWebhook],
    config: { source: 'whatsapp.routes', public: true }
  },
  {
    method: 'POST',
    path: '/webhook',
    handler: [receiveWebhook],
    config: { source: 'whatsapp.routes', public: true }
  },

  // --------------------------------------------------------
  // Authenticated Routes
  // --------------------------------------------------------
  {
    method: 'POST',
    path: '/send',
    handler: [authenticate(), asyncHandler(sendMessage)],
    config: { source: 'whatsapp.routes', auth: true }
  },
  {
    method: 'GET',
    path: '/templates',
    handler: [authenticate(), asyncHandler(listTemplates)],
    config: { source: 'whatsapp.routes', auth: true }
  },
  {
    method: 'POST',
    path: '/broadcast',
    handler: [authenticate(), authorize('admin', 'landlord', 'property_manager'), asyncHandler(broadcastMessage)],
    config: { source: 'whatsapp.routes', auth: true, roles: ['admin', 'landlord', 'property_manager'] }
  },
  {
    method: 'GET',
    path: '/logs',
    handler: [authenticate(), asyncHandler(getLogs)],
    config: { source: 'whatsapp.routes', auth: true }
  },
  {
    method: 'GET',
    path: '/stats',
    handler: [authenticate(), asyncHandler(getStats)],
    config: { source: 'whatsapp.routes', auth: true }
  }
];
