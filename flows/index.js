/**
 * Flows Module Entry Point
 * Exports Flow Engine and utilities
 */

const flowEngine = require('./FlowEngine');
const actions = require('./actions');
const flowDefinitions = require('./definitions');
const { setupModelEvents, setupPeriodicChecks } = require('./modelEvents');
const logger = require('../utils/logger');

/**
 * Initialize the Flow Engine with all actions and flows
 */
async function initializeFlowEngine() {
  logger.info('🚀 Initializing Flow Engine...');

  try {
    // Register all actions
    logger.info('📦 Registering actions...');
    Object.entries(actions).forEach(([actionType, handler]) => {
      flowEngine.registerAction(actionType, handler);
    });

    // Register all pre-built flows
    logger.info('📋 Registering flows...');
    const allFlows = flowDefinitions.getAllFlows();
    allFlows.forEach(flowDef => {
      try {
        flowEngine.registerFlow(flowDef);
      } catch (error) {
        logger.error(`Failed to register flow ${flowDef.id}: ${error.message}`);
      }
    });

    // Setup model event emitters
    logger.info('🔌 Setting up model events...');
    setupModelEvents();

    // Setup periodic checks
    logger.info('⏰ Setting up periodic checks...');
    setupPeriodicChecks();

    // Start the engine
    flowEngine.start();

    logger.info('✅ Flow Engine initialized successfully');
    logger.info(`   - ${Object.keys(actions).length} actions registered`);
    logger.info(`   - ${allFlows.length} flows registered`);
    logger.info(`   - ${allFlows.filter(f => f.enabled).length} flows enabled`);

    return flowEngine;
  } catch (error) {
    logger.error(`❌ Failed to initialize Flow Engine: ${error.message}`);
    throw error;
  }
}

/**
 * Shutdown the Flow Engine
 */
function shutdownFlowEngine() {
  logger.info('⏹️  Shutting down Flow Engine...');
  flowEngine.stop();
  logger.info('✅ Flow Engine stopped');
}

module.exports = {
  flowEngine,
  initializeFlowEngine,
  shutdownFlowEngine,
  actions,
  flowDefinitions
};
