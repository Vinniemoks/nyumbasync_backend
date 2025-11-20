/**
 * Security Configuration for NyumbaSync Backend
 * Centralized security settings and hardening
 */

const crypto = require('crypto');

// Generate strong secrets if not provided
const generateSecret = () => {
  return crypto.randomBytes(32).toString('hex');
};

const securityConfig = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || generateSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: 'HS256',
    issuer: 'NyumbaSync API',
    audience: 'nyumbasync.co.ke'
  },

  // Password Policy
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventCommon: true,
    historyCount: 5, // Prevent reusing last 5 passwords
    bcryptRounds: 12
  },

  // Account Lockout Policy
  accountLockout: {
    enabled: true,
    maxAttempts: 5,
    lockDuration: 15 * 60 * 1000, // 15 minutes
    resetAfter: 24 * 60 * 60 * 1000 // 24 hours
  },

  // Session Configuration
  session: {
    timeout: 30 * 60 * 1000, // 30 minutes
    absoluteTimeout: 12 * 60 * 60 * 1000, // 12 hours
    renewalThreshold: 5 * 60 * 1000 // 5 minutes
  },

  // Rate Limiting
  rateLimit: {
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many requests, please try again later'
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts'
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
      message: 'Too many password reset attempts'
    },
    upload: {
      windowMs: 60 * 60 * 1000,
      max: 20,
      message: 'Too many upload attempts'
    }
  },

  // CORS Configuration
  cors: {
    production: {
      origin: [
        'https://nyumbasync.co.ke',
        'https://www.nyumbasync.co.ke',
        'https://app.nyumbasync.co.ke'
      ],
      credentials: true,
      optionsSuccessStatus: 200,
      maxAge: 86400 // 24 hours
    },
    development: {
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000'
      ],
      credentials: true,
      optionsSuccessStatus: 200
    }
  },

  // Helmet Configuration (Security Headers)
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: {
      policy: 'same-origin'
    },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true
  },

  // File Upload Security
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    allowedExtensions: [
      '.jpg', '.jpeg', '.png', '.gif', '.webp',
      '.pdf', '.doc', '.docx'
    ],
    sanitizeFilename: true,
    useUUID: true
  },

  // Request Body Limits
  bodyParser: {
    json: {
      limit: '10mb',
      strict: true
    },
    urlencoded: {
      limit: '10mb',
      extended: true,
      parameterLimit: 10000
    }
  },

  // MongoDB Security
  mongodb: {
    sanitize: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority'
  },

  // Encryption Configuration
  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    saltLength: 64,
    tagLength: 16
  },

  // Audit Logging
  audit: {
    enabled: true,
    logSensitiveData: false,
    logLevel: 'info',
    events: [
      'LOGIN',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET',
      'ACCOUNT_LOCKED',
      'UNAUTHORIZED_ACCESS',
      'SENSITIVE_DATA_ACCESS',
      'ADMIN_ACTION'
    ]
  },

  // Security Monitoring
  monitoring: {
    enabled: true,
    alertOnSuspiciousActivity: true,
    suspiciousPatterns: [
      'MULTIPLE_FAILED_LOGINS',
      'RAPID_REQUESTS',
      'UNUSUAL_ACCESS_PATTERN',
      'PRIVILEGE_ESCALATION_ATTEMPT'
    ]
  },

  // Token Blacklist (Redis)
  tokenBlacklist: {
    enabled: true,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'blacklist:',
    ttl: 7 * 24 * 60 * 60 // 7 days
  },

  // MFA Configuration
  mfa: {
    enabled: false, // Enable in production
    issuer: 'NyumbaSync',
    window: 1, // Allow 1 time step before/after
    backupCodesCount: 10
  },

  // IP Whitelist/Blacklist
  ipControl: {
    enabled: false,
    whitelist: [],
    blacklist: []
  },

  // API Security
  api: {
    requireApiKey: false, // For external integrations
    apiKeyHeader: 'X-API-Key',
    versioning: true,
    deprecationWarnings: true
  },

  // HTTPS Configuration
  https: {
    enforceInProduction: true,
    redirectToHttps: true,
    trustProxy: true
  },

  // Error Handling
  errors: {
    exposeStackTrace: process.env.NODE_ENV !== 'production',
    genericMessages: process.env.NODE_ENV === 'production',
    logErrors: true
  }
};

// Validation function
const validateSecurityConfig = () => {
  const errors = [];

  // Check JWT secret strength
  if (securityConfig.jwt.secret.length < 32) {
    errors.push('JWT secret is too weak (minimum 32 characters)');
  }

  // Check if default secret is being used
  if (process.env.JWT_SECRET === 'your-secret-key-here') {
    errors.push('Default JWT secret detected - CHANGE IMMEDIATELY');
  }

  // Warn about development mode
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ Running in development mode - some security features may be relaxed');
  }

  if (errors.length > 0) {
    console.error('❌ Security Configuration Errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Security configuration validation failed');
    }
  }

  return errors.length === 0;
};

// Export configuration
module.exports = {
  securityConfig,
  validateSecurityConfig
};
