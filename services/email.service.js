const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    try {
      // Validate email configuration
      if (!config.email || !config.email.smtp) {
        logger.warn('Email configuration is missing - creating stub service');
        this.isStub = true;
        return;
      }

      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure, // true for 465, false for other ports
        auth: {
          user: config.email.smtp.auth.user,
          pass: config.email.smtp.auth.pass
        }
      });

      // Verify transporter connection
      this.transporter.verify((error) => {
        if (error) {
          logger.error('Error verifying email transporter:', error);
        } else {
          logger.info('Email transporter is ready');
        }
      });

      // Try to configure Handlebars templates with error handling
      try {
        const hbs = require('nodemailer-express-handlebars');
        
        const handlebarsOptions = {
          viewEngine: {
            handlebars: handlebars,
            extname: '.hbs',
            partialsDir: path.join(__dirname, '../views/emails/partials'),
            layoutsDir: path.join(__dirname, '../views/emails/layouts'),
            defaultLayout: 'main',
          },
          viewPath: path.join(__dirname, '../views/emails'),
          extName: '.hbs',
        };

        this.transporter.use('compile', hbs(handlebarsOptions));
        this.templatesEnabled = true;
        logger.info('Email templates configured successfully');
      } catch (hbsError) {
        logger.warn('Failed to configure email templates, falling back to plain text:', hbsError.message);
        this.templatesEnabled = false;
      }

      logger.info('EmailService initialized successfully');
    } catch (error) {
      logger.error('EmailService initialization failed:', error);
      this.isStub = true;
    }
  }

  /**
   * Check if service is available
   * @returns {Boolean}
   */
  isAvailable() {
    return !this.isStub && this.transporter;
  }

  /**
   * Verify if template exists
   * @param {String} templateName - Name of the template (without extension)
   * @returns {Promise<Boolean>}
   */
  async verifyTemplateExists(templateName) {
    if (!this.templatesEnabled) return false;
    
    try {
      const templatePath = path.join(__dirname, `../views/emails/${templateName}.hbs`);
      await fs.promises.access(templatePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      logger.warn(`Template ${templateName} not found: ${error.message}`);
      return false;
    }
  }

  /**
   * Send email with template validation
   * @param {Object} mailOptions - Email options
   * @returns {Promise}
   */
  async sendEmail(mailOptions) {
    if (this.isStub) {
      logger.warn('Email service is not available - email not sent');
      return { messageId: 'stub-' + Date.now() };
    }

    try {
      let emailContent = {};

      // If templates are enabled and template is specified
      if (this.templatesEnabled && mailOptions.template) {
        const templateExists = await this.verifyTemplateExists(mailOptions.template);
        if (templateExists) {
          emailContent = {
            template: mailOptions.template,
            context: mailOptions.context || {}
          };
        } else {
          // Fallback to plain text/HTML
          emailContent = {
            text: mailOptions.text || 'Email content not available',
            html: mailOptions.html || mailOptions.text || 'Email content not available'
          };
        }
      } else {
        // Use plain text/HTML
        emailContent = {
          text: mailOptions.text || 'Email content not available',
          html: mailOptions.html || mailOptions.text || 'Email content not available'
        };
      }

      const result = await this.transporter.sendMail({
        from: mailOptions.from || `"NyumbaSync" <${config.email.from}>`,
        to: mailOptions.to,
        subject: mailOptions.subject,
        ...emailContent
      });

      logger.info(`Email sent to ${mailOptions.to} - MessageID: ${result.messageId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send email to ${mailOptions.to}: ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send email verification
   * @param {String} to - Recipient email
   * @param {String} name - Recipient name
   * @param {String} token - Verification token
   * @returns {Promise}
   */
  async sendVerificationEmail(to, name, token) {
    const verificationUrl = `${config.client?.url || 'http://localhost:3000'}/verify-email?token=${token}`;
    
    return this.sendEmail({
      to,
      subject: 'Verify Your Email Address',
      template: 'verifyEmail',
      text: `Hello ${name},\n\nPlease verify your email address by clicking the link below:\n${verificationUrl}\n\nIf you didn't create an account with NyumbaSync, please ignore this email.`,
      html: `
        <h2>Email Verification</h2>
        <p>Hello ${name},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>If you didn't create an account with NyumbaSync, please ignore this email.</p>
      `,
      context: {
        name,
        verificationUrl,
        supportEmail: config.email?.support || 'support@nyumbasync.com'
      }
    });
  }

  /**
   * Send password reset email
   * @param {String} to - Recipient email
   * @param {String} name - Recipient name
   * @param {String} token - Reset token
   * @returns {Promise}
   */
  async sendPasswordResetEmail(to, name, token) {
    const resetUrl = `${config.client?.url || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    return this.sendEmail({
      to,
      subject: 'Password Reset Request',
      template: 'passwordReset',
      text: `Hello ${name},\n\nYou requested a password reset. Click the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, please ignore this email.`,
      html: `
        <h2>Password Reset</h2>
        <p>Hello ${name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
      `,
      context: {
        name,
        resetUrl,
        expiresIn: '1 hour',
        supportEmail: config.email?.support || 'support@nyumbasync.com'
      }
    });
  }

  /**
   * Send welcome email
   * @param {String} to - Recipient email
   * @param {String} name - Recipient name
   * @returns {Promise}
   */
  async sendWelcomeEmail(to, name) {
    return this.sendEmail({
      to,
      subject: 'Welcome to NyumbaSync!',
      template: 'welcome',
      text: `Welcome to NyumbaSync, ${name}!\n\nThank you for joining our platform. You can now manage your property rentals with ease.\n\nLogin at: ${config.client?.url || 'http://localhost:3000'}/login`,
      html: `
        <h2>Welcome to NyumbaSync!</h2>
        <p>Hello ${name},</p>
        <p>Thank you for joining our platform. You can now manage your property rentals with ease.</p>
        <a href="${config.client?.url || 'http://localhost:3000'}/login" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Now</a>
        <p>If you have any questions, feel free to contact our support team.</p>
      `,
      context: {
        name,
        loginUrl: `${config.client?.url || 'http://localhost:3000'}/login`,
        supportEmail: config.email?.support || 'support@nyumbasync.com'
      }
    });
  }

  /**
   * Send payment receipt
   * @param {String} to - Recipient email
   * @param {String} name - Recipient name
   * @param {Object} paymentDetails - Payment information
   * @returns {Promise}
   */
  async sendPaymentReceipt(to, name, paymentDetails) {
    return this.sendEmail({
      to,
      subject: 'Your Payment Receipt',
      template: 'paymentReceipt',
      text: `Hello ${name},\n\nYour payment has been received successfully.\n\nAmount: KES ${paymentDetails.amount}\nTransaction ID: ${paymentDetails.transactionId}\nDate: ${new Date().toLocaleDateString()}`,
      html: `
        <h2>Payment Receipt</h2>
        <p>Hello ${name},</p>
        <p>Your payment has been received successfully.</p>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Amount:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">KES ${paymentDetails.amount}</td></tr>
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Transaction ID:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${paymentDetails.transactionId}</td></tr>
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Date:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${new Date().toLocaleDateString()}</td></tr>
        </table>
      `,
      context: {
        name,
        ...paymentDetails,
        date: new Date().toLocaleDateString(),
        supportEmail: config.email?.support || 'support@nyumbasync.com'
      }
    });
  }

  /**
   * Send maintenance request confirmation
   * @param {String} to - Recipient email
   * @param {String} name - Recipient name
   * @param {Object} requestDetails - Maintenance request details
   * @returns {Promise}
   */
  async sendMaintenanceConfirmation(to, name, requestDetails) {
    return this.sendEmail({
      to,
      subject: 'Maintenance Request Received',
      template: 'maintenanceConfirmation',
      text: `Hello ${name},\n\nYour maintenance request has been received and is being processed.\n\nRequest ID: ${requestDetails.requestId}\nDescription: ${requestDetails.description}\nDate: ${new Date().toLocaleDateString()}`,
      html: `
        <h2>Maintenance Request Confirmation</h2>
        <p>Hello ${name},</p>
        <p>Your maintenance request has been received and is being processed.</p>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Request ID:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${requestDetails.requestId}</td></tr>
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Description:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${requestDetails.description}</td></tr>
          <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Date:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${new Date().toLocaleDateString()}</td></tr>
        </table>
      `,
      context: {
        name,
        ...requestDetails,
        date: new Date().toLocaleDateString(),
        supportEmail: config.email?.support || 'support@nyumbasync.com'
      }
    });
  }
}

// Create singleton instance with comprehensive error handling
let emailServiceInstance;
try {
  emailServiceInstance = new EmailService();
  logger.info('EmailService instance created successfully');
} catch (error) {
  logger.error('Failed to create EmailService instance:', error);
  
  // Create a stub instance that won't crash the app
  emailServiceInstance = {
    isAvailable: () => false,
    sendEmail: (mailOptions) => {
      logger.warn(`Email service unavailable - would have sent email to: ${mailOptions.to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
    sendVerificationEmail: (to, name, token) => {
      logger.warn(`Email service unavailable - would have sent verification email to: ${to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
    sendPasswordResetEmail: (to, name, token) => {
      logger.warn(`Email service unavailable - would have sent password reset email to: ${to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
    sendWelcomeEmail: (to, name) => {
      logger.warn(`Email service unavailable - would have sent welcome email to: ${to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
    sendPaymentReceipt: (to, name, paymentDetails) => {
      logger.warn(`Email service unavailable - would have sent payment receipt to: ${to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
    sendMaintenanceConfirmation: (to, name, requestDetails) => {
      logger.warn(`Email service unavailable - would have sent maintenance confirmation to: ${to}`);
      return Promise.resolve({ messageId: 'unavailable-' + Date.now() });
    },
  };
}

module.exports = emailServiceInstance;