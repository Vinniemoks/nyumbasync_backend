const winston = require('winston');
const { formatKenyanDate } = require('./formatters');

// Nairobi timezone-aware formatter
const kenyaTimestamp = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => formatKenyanDate(new Date())
    }),
    kenyaTimestamp
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.json()
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message }) => {
          const translations = {
            error: 'Kosa',
            warn: 'Onyo',
            info: 'Habari',
            debug: 'Uchunguzi'
          };
          return `${translations[level] || level}: ${message}`;
        })
      )
    })
  ]
});

// M-Pesa transaction logger
const logTransaction = (type, data) => {
  logger.info(`[MPESA] ${type}`, {
    ...data,
    location: 'Nairobi',
    timestamp: formatKenyanDate(new Date())
  });
};

// Authentication attempt logger
const logAuthAttempt = (identifier, action, details = '') => {
  logger.warn(`[AUTH] ${identifier} – ${action} ${details}`);
};

// Explicit named exports
module.exports = {
  logger,
  logTransaction,
  logAuthAttempt
};