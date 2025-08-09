// config/config.js
module.exports = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || '12345678',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // Email Configuration
  email: {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@nyumbasync.com',
    support: process.env.EMAIL_SUPPORT || process.env.SUPPORT_EMAIL || 'support@nyumbasync.com',
    smtp: {
      host: process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true' || false,
      auth: {
        user: process.env.EMAIL_USER || process.env.SMTP_USER,
        pass: process.env.EMAIL_PASS || process.env.SMTP_PASS
      }
    }
  },

  // Client Configuration
  client: {
    url: process.env.CLIENT_URL || 'http://localhost:3000'
  },

  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 10000,
    env: process.env.NODE_ENV || 'development'
  },

  // M-Pesa Configuration
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    environment: process.env.MPESA_ENV || 'sandbox',
    authUrl: process.env.MPESA_AUTH_URL || 'https://sandbox.safaricom.co.ke',
    apiUrl: process.env.MPESA_API_URL || 'https://sandbox.safaricom.co.ke/mpesa',
    b2c: {
      initiator: process.env.B2C_INITIATOR,
      securityCredential: process.env.B2C_SECURITY_CREDENTIAL,
      shortcode: process.env.B2C_SHORTCODE
    }
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880, // 5MB
    uploadPath: process.env.UPLOAD_PATH || './uploads'
  },

  // SMS Configuration
  sms: {
    africastalking: {
      username: process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME,
      apiKey: process.env.AFRICASTALKING_API_KEY || process.env.AT_API_KEY,
      senderId: process.env.SMS_SENDER_ID || 'NYUMBASYNC'
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_KE_NUMBER
    }
  },

  // Security Configuration
  security: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000']
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: './logs'
  },

  // API Configuration
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:10000',
    version: 'v1',
    debugUrl: process.env.DEBUG_URL || '/api/debug/routes'
  }
};