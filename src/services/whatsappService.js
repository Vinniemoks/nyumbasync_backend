/**
 * WhatsApp Business API Service
 * NyumbaSync Property Management Platform
 * 
 * Role: WhatsApp_Business_Integrator
 * 
 * This service handles all WhatsApp Business API interactions for NyumbaSync,
 * including templated message sending, incoming webhook processing, message routing,
 * auto-replies, and interaction logging.
 * 
 * NOTE: This module uses MOCK functions for development. Replace TODO sections
 * with real API integrations before production deployment.
 * 
 * Supported providers: Meta Business Platform, 360dialog, Twilio
 * Target market: Kenya (East Africa)
 * Compliance: Kenya Data Protection Act, 2019
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================
// TODO: Replace with real provider SDKs in production
// ============================================================
// const axios = require('axios');
// const twilio = require('twilio');

const logger = require('../../utils/logger');
const Communication = require('../../models/communication.model');
const Contact = require('../../models/contact.model');

// ============================================================
// WhatsApp Interaction Log Model (inline definition for portability)
// TODO: Move to /models/whatsapp-log.model.js in production
// ============================================================
const whatsappLogSchema = new Schema({
  // Message identification
  messageId: { type: String, index: true },      // Provider message ID (e.g., wamid.xxx)
  provider: { type: String, enum: ['meta', '360dialog', 'twilio'], required: true },
  direction: { type: String, enum: ['outbound', 'inbound'], required: true },
  
  // Participants
  senderPhone: { type: String, required: true },
  recipientPhone: { type: String },
  contactId: { type: Schema.Types.ObjectId, ref: 'Contact', index: true },
  
  // Content
  messageType: {
    type: String,
    enum: ['text', 'template', 'image', 'document', 'location', 'button', 'interactive', 'unknown'],
    default: 'text'
  },
  templateName: { type: String },
  body: { type: String, maxlength: 5000 },
  variables: [Schema.Types.Mixed],
  
  // Routing & department
  department: {
    type: String,
    enum: ['tenant_support', 'landlord_inquiries', 'maintenance_requests', 'general', 'system'],
    default: 'general'
  },
  intent: { type: String, default: 'general' },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'rejected', 'opted_out'],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    providerErrorCode: String,
    providerErrorMessage: String
  }],
  
  // Delivery metadata
  deliveredAt: Date,
  readAt: Date,
  failedAt: Date,
  
  // Auto-reply tracking
  autoReplySent: { type: Boolean, default: false },
  autoReplyBody: { type: String },
  
  // Consent & compliance
  optIn: { type: Boolean, default: true },
  optInSource: { type: String, enum: ['onboarding', 'portal', 'whatsapp', 'admin'], default: 'onboarding' },
  optOutAt: Date,
  
  // Rate limiting
  rateLimitBucket: { type: String, index: true },
  
  // Context
  relatedEntity: {
    entityType: { type: String, enum: ['Property', 'Transaction', 'MaintenanceRequest', 'Lease', 'Application'] },
    entityId: Schema.Types.ObjectId
  },
  tags: [String],
  metadata: Schema.Types.Mixed
}, { timestamps: true });

whatsappLogSchema.index({ senderPhone: 1, createdAt: -1 });
whatsappLogSchema.index({ status: 1, createdAt: -1 });
whatsappLogSchema.index({ department: 1, status: 1 });
whatsappLogSchema.index({ tags: 1 });

// Create model only if not already registered (handles hot reloads)
const WhatsAppLog = mongoose.models.WhatsAppLog || mongoose.model('WhatsAppLog', whatsappLogSchema);

// ============================================================
// Configuration & Constants
// ============================================================

const CONFIG = {
  provider: process.env.WHATSAPP_PROVIDER || '360dialog',
  meta: {
    apiVersion: process.env.WHATSAPP_META_API_VERSION || 'v18.0',
    phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_META_BUSINESS_ACCOUNT_ID,
    accessToken: process.env.WHATSAPP_META_ACCESS_TOKEN
  },
  dialog360: {
    apiKey: process.env.WHATSAPP_360DIALOG_API_KEY,
    channelId: process.env.WHATSAPP_360DIALOG_CHANNEL_ID,
    baseUrl: process.env.WHATSAPP_360DIALOG_BASE_URL || 'https://waba.360dialog.io'
  },
  twilio: {
    accountSid: process.env.WHATSAPP_TWILIO_ACCOUNT_SID,
    authToken: process.env.WHATSAPP_TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.WHATSAPP_TWILIO_PHONE_NUMBER
  },
  webhook: {
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  },
  limits: {
    dailyBroadcast: parseInt(process.env.WHATSAPP_DAILY_BROADCAST_LIMIT, 10) || 500,
    rateLimitRps: parseInt(process.env.WHATSAPP_RATE_LIMIT_RPS, 10) || 10,
    dataRetentionDays: parseInt(process.env.WHATSAPP_DATA_RETENTION_DAYS, 10) || 365
  },
  compliance: {
    optOutKeyword: process.env.WHATSAPP_OPT_OUT_KEYWORD || 'STOP',
    optInKeyword: 'START',
    businessHours: { start: 8, end: 18, timezone: 'Africa/Nairobi' }
  }
};

// ============================================================
// Template Registry
// ============================================================

const TEMPLATE_REGISTRY = {
  nyumbasync_rent_reminder: {
    category: 'UTILITY',
    language: 'en',
    variables: 6,
    description: 'Monthly rent payment reminder with M-Pesa details'
  },
  nyumbasync_payment_receipt: {
    category: 'UTILITY',
    language: 'en',
    variables: 7,
    description: 'Payment confirmation receipt with transaction details'
  },
  nyumbasync_maintenance_update: {
    category: 'UTILITY',
    language: 'en',
    variables: 7,
    description: 'Maintenance request status update'
  },
  nyumbasync_viewing_confirmation: {
    category: 'UTILITY',
    language: 'en',
    variables: 7,
    description: 'Property viewing appointment confirmation'
  },
  nyumbasync_lease_expiry: {
    category: 'UTILITY',
    language: 'en',
    variables: 5,
    description: 'Lease expiry reminder with renewal options'
  },
  nyumbasync_welcome: {
    category: 'UTILITY',
    language: 'en',
    variables: 3,
    description: 'Welcome/onboarding message for new tenants'
  },
  nyumbasync_emergency_alert: {
    category: 'UTILITY',
    language: 'en',
    variables: 6,
    description: 'Emergency maintenance alert for landlords'
  },
  nyumbasync_login_code: {
    category: 'UTILITY',
    language: 'en',
    variables: 3,
    description: 'One-time login code delivered to verified users'
  }
};

// ============================================================
// Keyword Auto-Reply Configuration
// ============================================================

const AUTO_REPLIES = {
  BALANCE: async (contact) => {
    // TODO: Integrate with payment/lease service to fetch real balance
    return `Hello ${contact.firstName || 'there'}, your current rent balance is KES 0. Next payment is due on the 5th of the month. Pay via M-Pesa PayBill or reply PAY for details. Asante!`;
  },
  RENT: async (contact) => AUTO_REPLIES.BALANCE(contact),
  FIX: async (contact) => {
    // TODO: Create real maintenance ticket via maintenance service
    const ticketNumber = `M-${Date.now().toString(36).toUpperCase().substr(-6)}`;
    return `Maintenance request received! Ticket #${ticketNumber}. A technician will contact you within 24 hours. For emergencies, call +254 700 000 000.`;
  },
  REPAIR: async (contact) => AUTO_REPLIES.FIX(contact),
  BOMBA: async (contact) => AUTO_REPLIES.FIX(contact),
  PAY: async (contact) => {
    // TODO: Fetch M-Pesa paybill details from property configuration
    return `Pay via M-Pesa:\nPayBill: 522522\nAccount: 12345\n\nOr use the NyumbaSync app: https://app.nyumbasync.co.ke/pay`;
  },
  LIPA: async (contact) => AUTO_REPLIES.PAY(contact),
  HELP: async (contact) => {
    return `NyumbaSync Help Menu:\n• BALANCE - Check rent balance\n• FIX - Report maintenance\n• PAY - M-Pesa payment details\n• AGENT - Contact property manager\n• STOP - Unsubscribe from alerts\n\nApp: https://app.nyumbasync.co.ke`;
  },
  SAIDA: async (contact) => AUTO_REPLIES.HELP(contact),
  AGENT: async (contact) => {
    // TODO: Forward message to assigned property manager via notification service
    return `Your message has been forwarded to your property manager. They will contact you shortly during business hours (Mon–Fri, 8am–6pm).`;
  },
  MANAGER: async (contact) => AUTO_REPLIES.AGENT(contact),
  CONFIRM: async (contact) => `Viewing confirmed! We look forward to seeing you. If you need to reschedule, reply CANCEL and we will arrange a new time.`,
  CANCEL: async (contact) => `Viewing cancelled. Reply BOOK to reschedule or contact your agent directly.`,
  RENEW: async (contact) => {
    // TODO: Initiate lease renewal workflow
    return `Lease renewal request received! Our team will contact you within 48 hours to discuss terms. Asante for staying with us!`;
  },
  MOVEOUT: async (contact) => {
    // TODO: Initiate move-out workflow
    return `Move-out request received. We will schedule a pre-move inspection within 72 hours. Please ensure the property is in good condition. Asante!`;
  },
  STOP: async (contact) => {
    await optOutContact(contact.phone);
    return `You have been unsubscribed from NyumbaSync WhatsApp alerts. You will no longer receive rent reminders or updates. Reply START to resubscribe.`;
  },
  UNSUBSCRIBE: async (contact) => AUTO_REPLIES.STOP(contact),
  START: async (contact) => {
    await optInContact(contact.phone);
    return `Welcome back! You are now subscribed to NyumbaSync WhatsApp alerts. Reply HELP for available options.`;
  },
  SUBSCRIBE: async (contact) => AUTO_REPLIES.START(contact)
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Format Kenyan phone numbers to international format (254XXXXXXXXX)
 * Handles: +254712345678, 0712345678, 254712345678
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  let formatted = phone.toString().replace(/[\s\-\(\)\+]/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  }
  
  if (!formatted.startsWith('254')) {
    formatted = '254' + formatted;
  }
  
  // Validate Kenyan mobile format: 2547xxxxxxxx or 2541xxxxxxxx
  const kenyanRegex = /^254[71]\d{8}$/;
  if (!kenyanRegex.test(formatted)) {
    logger.warn(`WHATSAPP_INVALID_PHONE_FORMAT: ${phone}`);
    return null;
  }
  
  return formatted;
};

/**
 * Check if current time is within Kenyan business hours
 * Monday–Friday, 08:00–18:00 EAT
 */
const isBusinessHours = () => {
  const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const date = new Date(now);
  const hour = date.getHours();
  const day = date.getDay();
  
  return day >= 1 && day <= 5 && hour >= CONFIG.compliance.businessHours.start && hour < CONFIG.compliance.businessHours.end;
};

/**
 * Detect message intent for routing
 */
const detectIntent = (messageText) => {
  const lower = (messageText || '').toLowerCase().trim();
  
  const intents = {
    maintenance: ['leak', 'broken', 'no water', 'blackout', 'fault', 'repair', 'plumber', 'electric', 'faulty', 'pipe', 'damaged', 'fix'],
    payment: ['paid', 'receipt', 'mpesa', 'transaction', 'proof', 'payment', 'money', 'cash', 'bank', 'transfer'],
    complaint: ['noise', 'neighbour', 'disturbance', 'unhappy', 'complaint', 'rude', 'problem', 'issue'],
    emergency: ['fire', 'flood', 'accident', 'injury', 'theft', 'police', 'ambulance', 'urgent', 'danger', 'broken into'],
    inquiry: ['rent', 'price', 'available', 'vacant', 'viewing', 'showing', 'visit', 'tour'],
    lease: ['renew', 'expiry', 'expire', 'move out', 'moving', 'vacate', 'termination', 'notice']
  };
  
  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(k => lower.includes(k))) {
      return { intent, priority: intent === 'emergency' ? 'urgent' : 'normal' };
    }
  }
  
  return { intent: 'general', priority: 'normal' };
};

/**
 * Map intent to department
 */
const intentToDepartment = (intent) => {
  const mapping = {
    maintenance: 'maintenance_requests',
    payment: 'tenant_support',
    complaint: 'tenant_support',
    emergency: 'maintenance_requests',
    inquiry: 'landlord_inquiries',
    lease: 'landlord_inquiries',
    general: 'general'
  };
  return mapping[intent] || 'general';
};

// ============================================================
// Consent Management
// ============================================================

/**
 * Opt out a phone number from WhatsApp communications
 */
const optOutContact = async (phone) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) return;
  
  await WhatsAppLog.updateMany(
    { senderPhone: formattedPhone },
    { $set: { optIn: false, optOutAt: new Date() } }
  );
  
  // TODO: Update Contact model opt-in status
  // await Contact.updateOne({ phone: formattedPhone }, { whatsappOptIn: false });
  
  logger.info(`WHATSAPP_OPT_OUT: ${formattedPhone}`);
};

/**
 * Opt in a phone number to WhatsApp communications
 */
const optInContact = async (phone) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) return;
  
  await WhatsAppLog.updateMany(
    { senderPhone: formattedPhone },
    { $set: { optIn: true, optOutAt: null } }
  );
  
  // TODO: Update Contact model opt-in status
  // await Contact.updateOne({ phone: formattedPhone }, { whatsappOptIn: true });
  
  logger.info(`WHATSAPP_OPT_IN: ${formattedPhone}`);
};

/**
 * Check if a phone number is opted in
 */
const isOptedIn = async (phone) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) return false;
  
  const latestLog = await WhatsAppLog.findOne(
    { senderPhone: formattedPhone },
    { optIn: 1 },
    { sort: { createdAt: -1 } }
  );
  
  return latestLog ? latestLog.optIn !== false : true; // Default to true if no record
};

// ============================================================
// Mock Provider Functions (TODO: Replace with real integrations)
// ============================================================

/**
 * MOCK: Send templated WhatsApp message via provider
 * TODO: Replace with real API call to Meta / 360dialog / Twilio
 */
const mockSendTemplate = async (phone, templateName, language, variables) => {
  // Simulate network latency
  await new Promise(r => setTimeout(r, 50));
  
  // Simulate occasional failures (1% rate) for testing retry logic
  if (Math.random() < 0.01) {
    const error = new Error('Simulated provider error');
    error.code = '131000';
    throw error;
  }
  
  const mockMessageId = `wamid.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  
  logger.info(`[MOCK] WhatsApp template sent: ${templateName} to ${phone}, id=${mockMessageId}`);
  
  return {
    success: true,
    messageId: mockMessageId,
    provider: CONFIG.provider,
    status: 'sent',
    timestamp: new Date().toISOString()
  };
};

/**
 * MOCK: Send free-form text message (only within 24h conversation window)
 * TODO: Replace with real API call
 */
const mockSendText = async (phone, text) => {
  await new Promise(r => setTimeout(r, 50));
  
  const mockMessageId = `wamid.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  
  logger.info(`[MOCK] WhatsApp text sent to ${phone}, id=${mockMessageId}`);
  
  return {
    success: true,
    messageId: mockMessageId,
    provider: CONFIG.provider,
    status: 'sent',
    timestamp: new Date().toISOString()
  };
};

// ============================================================
// Core Service Methods
// ============================================================

class WhatsAppService {
  constructor() {
    this.provider = CONFIG.provider;
    this.templateRegistry = TEMPLATE_REGISTRY;
    logger.info(`WhatsAppService initialized with provider: ${this.provider} (MOCK MODE)`);
  }

  // ----------------------------------------------------------
  // 1. Send Templated Message
  // ----------------------------------------------------------
  
  /**
   * Send a templated WhatsApp message to a single recipient
   * @param {Object} params - Send parameters
   * @param {string} params.templateName - Approved template name
   * @param {string} params.to - Recipient phone number (Kenyan format)
   * @param {string} params.language - ISO language code (e.g., 'en', 'sw')
   * @param {Array} params.variables - Template variable values
   * @param {string} [params.priority='normal'] - Message priority
   * @param {Array} [params.tags=[]] - Tags for tracking
   * @param {Object} [params.relatedEntity] - Related entity context
   * @returns {Promise<Object>} Send result
   */
  async sendTemplatedMessage(params) {
    const {
      templateName,
      to,
      language = 'en',
      variables = [],
      priority = 'normal',
      tags = [],
      relatedEntity = null
    } = params;

    try {
      // Validate inputs
      if (!templateName || !to) {
        throw new Error('Missing required fields: templateName and to are required');
      }

      const template = this.templateRegistry[templateName];
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Normalize phone
      const formattedPhone = formatPhoneNumber(to);
      if (!formattedPhone) {
        throw new Error(`Invalid phone number: ${to}`);
      }

      // Check consent
      const optedIn = await isOptedIn(formattedPhone);
      if (!optedIn) {
        logger.warn(`WHATSAPP_SEND_REJECTED_OPTED_OUT: ${formattedPhone}`);
        return {
          success: false,
          error: 'Recipient has opted out of WhatsApp communications',
          code: '136000'
        };
      }

      // Validate template variables count
      if (template.variables && variables.length !== template.variables) {
        throw new Error(`Template ${templateName} requires exactly ${template.variables} variables, got ${variables.length}`);
      }

      // Create log entry (pending)
      const log = await WhatsAppLog.create({
        provider: this.provider,
        direction: 'outbound',
        senderPhone: 'SYSTEM',
        recipientPhone: formattedPhone,
        messageType: 'template',
        templateName,
        body: this.renderTemplatePreview(templateName, variables),
        variables,
        status: 'pending',
        priority,
        tags,
        relatedEntity,
        statusHistory: [{ status: 'pending', timestamp: new Date() }]
      });

      // TODO: Replace with real provider integration
      // Meta: POST /v18.0/{phone-number-id}/messages
      // 360dialog: POST /v1/messages
      // Twilio: client.messages.create({ from: 'whatsapp:...', to: 'whatsapp:...', body: ... })
      const result = await mockSendTemplate(formattedPhone, templateName, language, variables);

      // Update log with success
      log.messageId = result.messageId;
      log.status = 'sent';
      log.statusHistory.push({ status: 'sent', timestamp: new Date() });
      await log.save();

      logger.info(`WHATSAPP_TEMPLATE_SENT: ${templateName} to ${formattedPhone}, msgId=${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
        logId: log._id,
        status: 'sent',
        timestamp: result.timestamp
      };

    } catch (error) {
      logger.error(`WHATSAPP_SEND_FAILED: ${templateName} to ${to}: ${error.message}`);
      
      // Update log with failure if created
      if (error.logId) {
        await WhatsAppLog.findByIdAndUpdate(error.logId, {
          status: 'failed',
          $push: { statusHistory: { status: 'failed', timestamp: new Date(), providerErrorMessage: error.message } }
        });
      }
      
      throw error;
    }
  }

  /**
   * Render a preview of the templated message for logging
   */
  renderTemplatePreview(templateName, variables) {
    const previews = {
      nyumbasync_rent_reminder: `Hello ${variables[0] || 'Tenant'}, rent KES ${variables[1] || '0'} for ${variables[2] || 'Property'} due ${variables[3] || 'soon'}.`,
      nyumbasync_payment_receipt: `Payment received: KES ${variables[1] || '0'} for ${variables[3] || 'rent'}. TxID: ${variables[4] || 'N/A'}.`,
      nyumbasync_maintenance_update: `Maintenance #${variables[1] || 'N/A'}: ${variables[2] || 'Updated'}.`,
      nyumbasync_viewing_confirmation: `Viewing confirmed: ${variables[1] || 'Property'} on ${variables[2] || 'TBD'} at ${variables[3] || 'TBD'}.`,
      nyumbasync_lease_expiry: `Lease expiry: ${variables[2] || 'Property'} expires ${variables[1] || 'soon'}.`,
      nyumbasync_welcome: `Welcome ${variables[0] || 'Tenant'} to ${variables[1] || 'NyumbaSync'}!`,
      nyumbasync_emergency_alert: `EMERGENCY: ${variables[2] || 'Issue'} at ${variables[1] || 'Property'}.`,
      nyumbasync_login_code: `Login code for ${variables[0] || 'User'}: ${variables[1] || '********'} (expires in ${variables[2] || '10'} minutes).`
    };
    return previews[templateName] || `[Template: ${templateName}]`;
  }

  // ----------------------------------------------------------
  // 2. Handle Incoming Webhook
  // ----------------------------------------------------------

  /**
   * Process incoming webhook payload from WhatsApp provider
   * @param {Object} payload - Raw webhook payload
   * @returns {Promise<Object>} Processing result
   */
  async handleIncomingWebhook(payload) {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid webhook payload');
      }

      // Extract entries (Meta/360dialog format)
      const entries = payload.entry || [payload];
      const results = [];

      for (const entry of entries) {
        const changes = entry.changes || [];
        
        for (const change of changes) {
          const value = change.value || {};
          
          // Handle incoming messages
          if (value.messages && Array.isArray(value.messages)) {
            for (const message of value.messages) {
              const result = await this.processIncomingMessage(message, value);
              results.push(result);
            }
          }
          
          // Handle message status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const status of value.statuses) {
              const result = await this.processStatusUpdate(status);
              results.push(result);
            }
          }
        }
      }

      return { success: true, processed: results.length, results };

    } catch (error) {
      logger.error(`WHATSAPP_WEBHOOK_ERROR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a single incoming message
   */
  async processIncomingMessage(message, value) {
    const from = formatPhoneNumber(message.from);
    const messageId = message.id;
    const timestamp = new Date(parseInt(message.timestamp, 10) * 1000);
    
    // De-duplicate by message ID
    const existing = await WhatsAppLog.findOne({ messageId });
    if (existing) {
      logger.warn(`WHATSAPP_DUPLICATE_MESSAGE: ${messageId}`);
      return { action: 'duplicate', messageId };
    }

    // Extract content based on message type
    let messageType = 'unknown';
    let body = '';
    
    if (message.text) {
      messageType = 'text';
      body = message.text.body;
    } else if (message.image) {
      messageType = 'image';
      body = `[Image: ${message.image.caption || 'no caption'}]`;
    } else if (message.document) {
      messageType = 'document';
      body = `[Document: ${message.document.filename || 'unnamed'}]`;
    } else if (message.location) {
      messageType = 'location';
      body = `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
    } else if (message.button) {
      messageType = 'button';
      body = message.button.text;
    } else if (message.interactive) {
      messageType = 'interactive';
      body = message.interactive.button_reply?.title || message.interactive.list_reply?.title || '[interactive]';
    }

    // Detect intent and route
    const { intent, priority } = detectIntent(body);
    const department = intentToDepartment(intent);

    // Find or create contact
    // TODO: Lookup real contact from Contact model
    let contact = await Contact.findOne({ phone: from }).select('firstName lastName email role').lean();
    if (!contact) {
      contact = { firstName: 'Unknown', lastName: '', phone: from, role: 'tenant' };
    }

    // Log the incoming message
    const log = await WhatsAppLog.create({
      messageId,
      provider: this.provider,
      direction: 'inbound',
      senderPhone: from,
      recipientPhone: value.metadata?.display_phone_number || 'SYSTEM',
      contactId: contact._id || null,
      messageType,
      body: body.substring(0, 5000), // Truncate for storage
      intent,
      department,
      status: 'delivered',
      deliveredAt: timestamp,
      metadata: { rawMessage: message }
    });

    logger.info(`WHATSAPP_INBOUND: ${messageType} from ${from}, intent=${intent}, dept=${department}`);

    // Handle opt-in / opt-out
    const upperBody = body.trim().toUpperCase();
    if (upperBody === CONFIG.compliance.optOutKeyword || upperBody === 'UNSUBSCRIBE') {
      const reply = await AUTO_REPLIES.STOP(contact);
      await this.sendAutoReply(from, reply, log._id);
      return { action: 'opt_out', messageId, department };
    }
    
    if (upperBody === CONFIG.compliance.optInKeyword || upperBody === 'SUBSCRIBE') {
      const reply = await AUTO_REPLIES.START(contact);
      await this.sendAutoReply(from, reply, log._id);
      return { action: 'opt_in', messageId, department };
    }

    // Handle keyword auto-replies
    const keywordHandler = AUTO_REPLIES[upperBody];
    if (keywordHandler) {
      const reply = await keywordHandler(contact);
      await this.sendAutoReply(from, reply, log._id);
      return { action: 'auto_reply', messageId, keyword: upperBody, department };
    }

    // Business hours check
    if (!isBusinessHours() && priority !== 'urgent') {
      const reply = `Thank you for contacting NyumbaSync. Our office hours are Monday–Friday, 8:00 AM – 6:00 PM (EAT). We will respond to your message during business hours. For emergencies, please call +254 700 000 000.`;
      await this.sendAutoReply(from, reply, log._id);
      return { action: 'business_hours_auto_reply', messageId, department };
    }

    // Route to department (general routing for unmatched messages)
    // TODO: Integrate with notification service to alert department
    // await notificationService.notifyDepartment(department, { message: body, from, contact });

    return { action: 'routed', messageId, intent, department, priority };
  }

  /**
   * Send an auto-reply message
   */
  async sendAutoReply(to, text, parentLogId) {
    try {
      const formattedPhone = formatPhoneNumber(to);
      if (!formattedPhone) return;

      // Check if opted in (allow auto-replies even to opted-out for confirmation messages)
      const optedIn = await isOptedIn(formattedPhone);
      if (!optedIn) {
        logger.warn(`WHATSAPP_AUTO_REPLY_SKIPPED_OPTED_OUT: ${formattedPhone}`);
        return;
      }

      // TODO: Replace with real provider integration for free-form messages
      // Note: Free-form messages only work within 24h of last inbound message
      const result = await mockSendText(formattedPhone, text);

      // Log auto-reply
      const log = await WhatsAppLog.create({
        messageId: result.messageId,
        provider: this.provider,
        direction: 'outbound',
        senderPhone: 'SYSTEM',
        recipientPhone: formattedPhone,
        messageType: 'text',
        body: text,
        status: 'sent',
        autoReplySent: true,
        autoReplyBody: text,
        statusHistory: [{ status: 'sent', timestamp: new Date() }]
      });

      // Update parent log
      await WhatsAppLog.findByIdAndUpdate(parentLogId, {
        autoReplySent: true,
        autoReplyBody: text
      });

      logger.info(`WHATSAPP_AUTO_REPLY_SENT: to ${formattedPhone}`);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      logger.error(`WHATSAPP_AUTO_REPLY_FAILED: ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ----------------------------------------------------------
  // 3. Status Update Handling
  // ----------------------------------------------------------

  /**
   * Process delivery status updates (sent, delivered, read, failed)
   */
  async processStatusUpdate(status) {
    const messageId = status.id;
    const newStatus = status.status; // 'sent', 'delivered', 'read', 'failed'
    const timestamp = new Date(parseInt(status.timestamp, 10) * 1000);

    const update = {
      status: newStatus,
      $push: { statusHistory: { status: newStatus, timestamp } }
    };

    if (newStatus === 'delivered') update.deliveredAt = timestamp;
    if (newStatus === 'read') update.readAt = timestamp;
    if (newStatus === 'failed') {
      update.failedAt = timestamp;
      update.$push.statusHistory.providerErrorCode = status.errors?.[0]?.code;
      update.$push.statusHistory.providerErrorMessage = status.errors?.[0]?.message;
    }

    const log = await WhatsAppLog.findOneAndUpdate(
      { messageId },
      update,
      { new: true }
    );

    if (!log) {
      logger.warn(`WHATSAPP_STATUS_UNKNOWN_MESSAGE: ${messageId}`);
      return { action: 'unknown_message', messageId };
    }

    logger.info(`WHATSAPP_STATUS_UPDATE: ${messageId} → ${newStatus}`);
    return { action: 'status_updated', messageId, status: newStatus };
  }

  // ----------------------------------------------------------
  // 4. Bulk Broadcast
  // ----------------------------------------------------------

  /**
   * Send templated message to multiple recipients (broadcast)
   * @param {Object} params - Broadcast parameters
   * @param {string} params.templateName - Approved template name
   * @param {Array<string>} params.recipients - Array of phone numbers
   * @param {string} params.language - ISO language code
   * @param {Array} params.variables - Template variables
   * @param {Array} [params.tags=[]] - Tags
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcast(params) {
    const { templateName, recipients, language = 'en', variables = [], tags = [] } = params;

    try {
      if (!templateName || !Array.isArray(recipients)) {
        throw new Error('Missing required fields: templateName and recipients array are required');
      }

      // Enforce daily broadcast limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await WhatsAppLog.countDocuments({
        direction: 'outbound',
        messageType: 'template',
        createdAt: { $gte: today }
      });

      if (todayCount + recipients.length > CONFIG.limits.dailyBroadcast) {
        throw new Error(`Broadcast limit exceeded. Today: ${todayCount}, Requested: ${recipients.length}, Limit: ${CONFIG.limits.dailyBroadcast}`);
      }

      logger.info(`WHATSAPP_BROADCAST_START: ${templateName} to ${recipients.length} recipients`);

      const results = {
        total: recipients.length,
        sent: 0,
        failed: 0,
        rejected: 0,
        errors: []
      };

      // Process with rate limiting
      for (let i = 0; i < recipients.length; i++) {
        const phone = recipients[i];
        
        // Rate limit: max RPS
        if (i > 0 && i % CONFIG.limits.rateLimitRps === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }

        try {
          const result = await this.sendTemplatedMessage({
            templateName,
            to: phone,
            language,
            variables,
            tags: [...tags, 'broadcast']
          });
          
          if (result.success) {
            results.sent++;
          } else {
            results.rejected++;
            results.errors.push({ phone, error: result.error });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ phone, error: error.message });
        }
      }

      logger.info(`WHATSAPP_BROADCAST_COMPLETE: ${results.sent} sent, ${results.failed} failed, ${results.rejected} rejected`);

      return { success: true, results };

    } catch (error) {
      logger.error(`WHATSAPP_BROADCAST_FAILED: ${error.message}`);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // 5. Template Management
  // ----------------------------------------------------------

  /**
   * List all available templates
   * @returns {Array} Template catalog
   */
  listTemplates() {
    return Object.entries(this.templateRegistry).map(([name, info]) => ({
      name,
      ...info
    }));
  }

  /**
   * Get a single template by name
   */
  getTemplate(name) {
    return this.templateRegistry[name] || null;
  }

  // ----------------------------------------------------------
  // 6. Logging & Analytics
  // ----------------------------------------------------------

  /**
   * Get message logs with filtering
   */
  async getLogs(filters = {}, options = {}) {
    const query = {};
    
    if (filters.phone) query.senderPhone = formatPhoneNumber(filters.phone);
    if (filters.department) query.department = filters.department;
    if (filters.status) query.status = filters.status;
    if (filters.direction) query.direction = filters.direction;
    if (filters.fromDate || filters.toDate) {
      query.createdAt = {};
      if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
      if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
    }
    if (filters.tags && filters.tags.length) query.tags = { $in: filters.tags };

    return WhatsAppLog.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100)
      .skip(options.offset || 0)
      .lean();
  }

  /**
   * Get delivery statistics
   */
  async getStats(period = '7d') {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period, 10));

    const stats = await WhatsAppLog.aggregate([
      { $match: { createdAt: { $gte: fromDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const breakdown = {};
    stats.forEach(s => { breakdown[s._id] = s.count; });

    return {
      period,
      total,
      breakdown,
      deliveryRate: total ? ((breakdown.delivered || 0) + (breakdown.read || 0)) / total : 0,
      readRate: total ? (breakdown.read || 0) / total : 0,
      failureRate: total ? (breakdown.failed || 0) / total : 0
    };
  }

  // ----------------------------------------------------------
  // 7. Data Retention & Cleanup
  // ----------------------------------------------------------

  /**
   * Clean up old WhatsApp logs per Data Protection Act compliance
   */
  async cleanupOldLogs(days = CONFIG.limits.dataRetentionDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await WhatsAppLog.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['read', 'delivered', 'failed'] }
    });

    logger.info(`WHATSAPP_CLEANUP: Deleted ${result.deletedCount} old logs older than ${days} days`);
    return result;
  }
}

// ============================================================
// Export Singleton Instance
// ============================================================

module.exports = new WhatsAppService();
