const twilio = require('twilio');
const logger = require('../utils/logger');

// Initialize Twilio client
let twilioClient = null;

const initializeTwilio = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio credentials not configured');
    return null;
  }
  
  try {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    logger.info('Twilio client initialized successfully');
    return twilioClient;
  } catch (error) {
    logger.error('Error initializing Twilio:', error);
    return null;
  }
};

// Format phone number for Kenyan numbers
const formatPhoneNumber = (phone) => {
  // Remove any spaces, dashes, or parentheses
  let formatted = phone.replace(/[\s\-\(\)]/g, '');
  
  // If starts with 0, replace with 254
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  }
  
  // If doesn't start with +, add it
  if (!formatted.startsWith('+')) {
    formatted = '+' + formatted;
  }
  
  return formatted;
};

// Send SMS function
const sendSMS = async (to, message) => {
  try {
    if (!twilioClient) {
      twilioClient = initializeTwilio();
    }
    
    if (!twilioClient) {
      logger.warn('SMS not configured, skipping SMS send');
      return { success: false, message: 'SMS not configured' };
    }
    
    const formattedPhone = formatPhoneNumber(to);
    
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    logger.info(`SMS sent successfully to ${formattedPhone}: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    logger.error(`Error sending SMS to ${to}:`, error);
    throw error;
  }
};

// Specific SMS functions
const sendWelcomeSMS = async (user) => {
  const message = `Welcome to NyumbaSync, ${user.firstName}! Your account has been created successfully. Visit https://nyumbasync.co.ke to get started.`;
  return sendSMS(user.phone, message);
};

const sendVerificationCodeSMS = async (phone, code) => {
  const message = `Your NyumbaSync verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;
  return sendSMS(phone, message);
};

const sendPasswordResetSMS = async (user, code) => {
  const message = `Your NyumbaSync password reset code is: ${code}. Valid for 10 minutes. If you didn't request this, please ignore.`;
  return sendSMS(user.phone, message);
};

const sendPaymentConfirmationSMS = async (user, payment) => {
  const message = `Payment received! KES ${payment.amount.toLocaleString()} for ${payment.description || 'rent'}. Transaction ID: ${payment.transactionId}. Thank you!`;
  return sendSMS(user.phone, message);
};

const sendRentReminderSMS = async (user, payment) => {
  const daysUntilDue = Math.ceil((new Date(payment.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
  const message = `Rent reminder: KES ${payment.amount.toLocaleString()} due in ${daysUntilDue} days (${new Date(payment.dueDate).toLocaleDateString('en-KE')}). Pay via M-Pesa or app.`;
  return sendSMS(user.phone, message);
};

const sendMaintenanceUpdateSMS = async (user, maintenance) => {
  const message = `Maintenance update: ${maintenance.ticketNumber} - ${maintenance.title}. Status: ${maintenance.status}. Check app for details.`;
  return sendSMS(user.phone, message);
};

const sendLeaseExpirySMS = async (user, lease) => {
  const daysUntilExpiry = Math.ceil((new Date(lease.endDate) - new Date()) / (1000 * 60 * 60 * 24));
  const message = `Lease expiry reminder: Your lease expires in ${daysUntilExpiry} days on ${new Date(lease.endDate).toLocaleDateString('en-KE')}. Contact your landlord to renew.`;
  return sendSMS(user.phone, message);
};

const sendMoveOutConfirmationSMS = async (user, moveOutRequest) => {
  const message = `Move-out request received. Reference: ${moveOutRequest.referenceNumber}. Move-out date: ${new Date(moveOutRequest.moveOutDate).toLocaleDateString('en-KE')}. We'll contact you soon.`;
  return sendSMS(user.phone, message);
};

module.exports = {
  sendSMS,
  sendWelcomeSMS,
  sendVerificationCodeSMS,
  sendPasswordResetSMS,
  sendPaymentConfirmationSMS,
  sendRentReminderSMS,
  sendMaintenanceUpdateSMS,
  sendLeaseExpirySMS,
  sendMoveOutConfirmationSMS
};
