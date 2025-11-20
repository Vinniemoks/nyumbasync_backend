const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Register Handlebars helpers
handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

handlebars.registerHelper('formatCurrency', function(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES'
  }).format(amount);
});

handlebars.registerHelper('formatDate', function(date) {
  return new Date(date).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Load and compile email template with layout
const loadTemplate = (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../views/emails', `${templateName}.hbs`);
    const layoutPath = path.join(__dirname, '../views/emails', '_layout.hbs');
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      logger.warn(`Email template not found: ${templateName}, using default`);
      return createDefaultTemplate(data);
    }
    
    // Load template content
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const bodyContent = template(data);
    
    // Load layout if exists
    if (fs.existsSync(layoutPath)) {
      const layoutSource = fs.readFileSync(layoutPath, 'utf8');
      const layoutTemplate = handlebars.compile(layoutSource);
      
      return layoutTemplate({
        ...data,
        body: bodyContent,
        year: new Date().getFullYear(),
        appUrl: process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'
      });
    }
    
    // Return just the body if no layout
    return bodyContent;
  } catch (error) {
    logger.error(`Error loading email template ${templateName}:`, error);
    return createDefaultTemplate(data);
  }
};

// Create default template if custom template doesn't exist
const createDefaultTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>NyumbaSync</h1>
        </div>
        <div class="content">
          ${data.content || '<p>You have a new notification from NyumbaSync.</p>'}
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} NyumbaSync. All rights reserved.</p>
          <p>Nairobi, Kenya</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send email function
const sendEmail = async (to, subject, template, data) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      logger.warn('Email credentials not configured, skipping email send');
      return { success: false, message: 'Email not configured' };
    }
    
    const transporter = createTransporter();
    const html = loadTemplate(template, data);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'NyumbaSync <noreply@nyumbasync.co.ke>',
      to,
      subject,
      html
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`Email sent successfully to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error);
    throw error;
  }
};

// Specific email functions
const sendWelcomeEmail = async (user) => {
  return sendEmail(
    user.email,
    'Welcome to NyumbaSync',
    'welcome',
    {
      name: user.firstName || 'User',
      email: user.email,
      appUrl: process.env.FRONTEND_URL || 'https://nyumbasync.co.ke',
      content: `
        <h2>Welcome to NyumbaSync, ${user.firstName}!</h2>
        <p>Thank you for joining NyumbaSync, Kenya's leading property management platform.</p>
        <p>You can now:</p>
        <ul>
          <li>Manage your properties</li>
          <li>Track rent payments</li>
          <li>Submit maintenance requests</li>
          <li>Communicate with your landlord/tenants</li>
        </ul>
        <p><a href="${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}" class="button">Get Started</a></p>
      `
    }
  );
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/reset-password?token=${resetToken}`;
  
  return sendEmail(
    user.email,
    'Password Reset Request - NyumbaSync',
    'password-reset',
    {
      name: user.firstName || 'User',
      resetUrl,
      resetToken,
      expiryTime: '10 minutes',
      content: `
        <h2>Password Reset Request</h2>
        <p>Hi ${user.firstName},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <p><a href="${resetUrl}" class="button">Reset Password</a></p>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    }
  );
};

const sendPaymentConfirmation = async (user, payment) => {
  return sendEmail(
    user.email,
    'Payment Confirmation - NyumbaSync',
    'payment-confirmation',
    {
      name: user.firstName || 'User',
      amount: payment.amount,
      transactionId: payment.transactionId,
      date: new Date(payment.date).toLocaleDateString('en-KE'),
      content: `
        <h2>Payment Received</h2>
        <p>Hi ${user.firstName},</p>
        <p>We have received your payment of <strong>KES ${payment.amount.toLocaleString()}</strong>.</p>
        <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
        <p><strong>Date:</strong> ${new Date(payment.date).toLocaleDateString('en-KE')}</p>
        <p>Thank you for your payment!</p>
      `
    }
  );
};

const sendMaintenanceUpdate = async (user, maintenance) => {
  return sendEmail(
    user.email,
    `Maintenance Request Update - ${maintenance.ticketNumber}`,
    'maintenance-update',
    {
      name: user.firstName || 'User',
      ticketNumber: maintenance.ticketNumber,
      status: maintenance.status,
      title: maintenance.title,
      content: `
        <h2>Maintenance Request Update</h2>
        <p>Hi ${user.firstName},</p>
        <p>Your maintenance request has been updated:</p>
        <p><strong>Ticket:</strong> ${maintenance.ticketNumber}</p>
        <p><strong>Issue:</strong> ${maintenance.title}</p>
        <p><strong>Status:</strong> ${maintenance.status}</p>
        <p>We'll keep you updated on the progress.</p>
      `
    }
  );
};

const sendLeaseReminder = async (user, lease) => {
  const daysUntilExpiry = Math.ceil((new Date(lease.endDate) - new Date()) / (1000 * 60 * 60 * 24));
  
  return sendEmail(
    user.email,
    'Lease Expiry Reminder - NyumbaSync',
    'lease-reminder',
    {
      name: user.firstName || 'User',
      daysUntilExpiry,
      endDate: new Date(lease.endDate).toLocaleDateString('en-KE'),
      content: `
        <h2>Lease Expiry Reminder</h2>
        <p>Hi ${user.firstName},</p>
        <p>Your lease is expiring in <strong>${daysUntilExpiry} days</strong> on ${new Date(lease.endDate).toLocaleDateString('en-KE')}.</p>
        <p>Please contact your landlord if you wish to renew your lease.</p>
      `
    }
  );
};

const sendRentReminder = async (user, payment) => {
  return sendEmail(
    user.email,
    'Rent Payment Reminder - NyumbaSync',
    'rent-reminder',
    {
      name: user.firstName || 'User',
      amount: payment.amount,
      dueDate: new Date(payment.dueDate).toLocaleDateString('en-KE'),
      content: `
        <h2>Rent Payment Reminder</h2>
        <p>Hi ${user.firstName},</p>
        <p>This is a reminder that your rent payment of <strong>KES ${payment.amount.toLocaleString()}</strong> is due on ${new Date(payment.dueDate).toLocaleDateString('en-KE')}.</p>
        <p>Please make your payment on time to avoid late fees.</p>
        <p><a href="${process.env.FRONTEND_URL || 'https://nyumbasync.co.ke'}/payments" class="button">Pay Now</a></p>
      `
    }
  );
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPaymentConfirmation,
  sendMaintenanceUpdate,
  sendLeaseReminder,
  sendRentReminder
};
