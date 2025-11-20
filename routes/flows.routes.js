/**
 * Flow Engine API Routes
 */

const express = require('express');
const router = express.Router();
const { flowEngine } = require('../flows');
const logger = require('../utils/logger');

/**
 * GET /api/flows
 * Get all registered flows
 */
router.get('/', (req, res) => {
  try {
    const flows = flowEngine.getFlows();
    res.json({
      success: true,
      count: flows.length,
      flows
    });
  } catch (error) {
    logger.error(`Error getting flows: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/flows/stats
 * Get Flow Engine statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = flowEngine.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error(`Error getting stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/flows/:flowId
 * Get a specific flow
 */
router.get('/:flowId', (req, res) => {
  try {
    const flow = flowEngine.getFlow(req.params.flowId);
    
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found'
      });
    }

    res.json({
      success: true,
      flow
    });
  } catch (error) {
    logger.error(`Error getting flow: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/flows
 * Register a new flow
 */
router.post('/', (req, res) => {
  try {
    const flowDefinition = req.body;
    const flow = flowEngine.registerFlow(flowDefinition);
    
    res.status(201).json({
      success: true,
      message: 'Flow registered successfully',
      flow
    });
  } catch (error) {
    logger.error(`Error registering flow: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/flows/:flowId/enable
 * Enable a flow
 */
router.put('/:flowId/enable', (req, res) => {
  try {
    const flow = flowEngine.enableFlow(req.params.flowId);
    
    res.json({
      success: true,
      message: 'Flow enabled',
      flow
    });
  } catch (error) {
    logger.error(`Error enabling flow: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/flows/:flowId/disable
 * Disable a flow
 */
router.put('/:flowId/disable', (req, res) => {
  try {
    const flow = flowEngine.disableFlow(req.params.flowId);
    
    res.json({
      success: true,
      message: 'Flow disabled',
      flow
    });
  } catch (error) {
    logger.error(`Error disabling flow: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/flows/:flowId
 * Unregister a flow
 */
router.delete('/:flowId', (req, res) => {
  try {
    flowEngine.unregisterFlow(req.params.flowId);
    
    res.json({
      success: true,
      message: 'Flow unregistered'
    });
  } catch (error) {
    logger.error(`Error unregistering flow: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/flows/history
 * Get execution history
 */
router.get('/history/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = flowEngine.getExecutionHistory(limit);
    
    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    logger.error(`Error getting history: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/flows/trigger
 * Manually trigger an event
 */
router.post('/trigger', async (req, res) => {
  try {
    const { eventName, eventData } = req.body;
    
    if (!eventName) {
      return res.status(400).json({
        success: false,
        error: 'Event name is required'
      });
    }

    await flowEngine.triggerEvent(eventName, eventData || {});
    
    res.json({
      success: true,
      message: `Event "${eventName}" triggered`
    });
  } catch (error) {
    logger.error(`Error triggering event: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
