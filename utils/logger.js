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

// Export logger as default and also export logTransaction
module.exports = logger;
module.exports.logTransaction = logTransaction;