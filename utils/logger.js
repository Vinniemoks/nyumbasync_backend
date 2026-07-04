const winston = require('winston');

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    // Add other transports like file, database, etc. here
  ],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  // Add logging levels here
  level: 'info',
});

const logTransaction = (type, data) => {
  logger.info(`TRANSACTION_TYPE: ${type}, DATA: ${JSON.stringify(data)}`);
};

const logAdminActivity = (actorId, action, meta = {}) => {
  logger.info({
    event: 'ADMIN_ACTIVITY',
    actorId: actorId ? String(actorId) : null,
    action,
    meta,
    timestamp: new Date().toISOString(),
  });
};

// Export logger as default and also export helpers
module.exports = logger;
module.exports.logTransaction = logTransaction;
module.exports.logAdminActivity = logAdminActivity;
