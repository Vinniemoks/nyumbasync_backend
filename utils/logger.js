const winston = require('winston');
const { formatKenyanDate } = require('./formatters');

// Nairobi timezone-aware formatter
const kenyaTimestamp = format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: () => formatKenyanDate(new Date())
    }),
    kenyaTimestamp
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log',
      level: 'error',
      format: format.json()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: format.json()
    }),
    // Console with Swahili translations
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message }) => {
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
exports.logTransaction = (type, data) => {
  logger.info(`[MPESA] ${type}`, {
    ...data,
    location: 'Nairobi',
    timestamp: formatKenyanDate(new Date())
  });
};

module.exports = logger;
