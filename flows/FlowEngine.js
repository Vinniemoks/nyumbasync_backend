/**
 * Nyumbasync Flow Engine
 * Event-driven automation system for real estate workflows
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class FlowEngine extends EventEmitter {
  constructor() {
    super();
    this.flows = new Map();
    this.actions = new Map();
    this.isRunning = false;
    this.executionHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Start the Flow Engine
   */
  start() {
    if (this.isRunning) {
      logger.warn('Flow Engine is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Flow Engine started');
    this.emit('engine:started');
  }

  /**
   * Stop the Flow Engine
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Flow Engine is not running');
      return;
    }

    this.isRunning = false;
    logger.info('⏹️  Flow Engine stopped');
    this.emit('engine:stopped');
  }

  /**
   * Register a flow definition
   * @param {Object} flowDefinition - Flow configuration
   */
  registerFlow(flowDefinition) {
    const { id, name, trigger, conditions, actions, enabled = true } = flowDefinition;

    if (!id || !name || !trigger || !actions) {
      throw new Error('Invalid flow definition: missing required fields');
    }

    const flow = {
      id,
      name,
      trigger,
      conditions: conditions || [],
      actions,
      enabled,
      executionCount: 0,
      lastExecuted: null,
      createdAt: new Date()
    };

    this.flows.set(id, flow);
    
    // Register event listener for this flow's trigger
    if (enabled) {
      this._attachFlowListener(flow);
    }

    logger.info(`✅ Flow registered: ${name} (${id})`);
    return flow;
  }

  /**
   * Unregister a flow
   * @param {String} flowId - Flow ID
   */
  unregisterFlow(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    this._detachFlowListener(flow);
    this.flows.delete(flowId);
    logger.info(`🗑️  Flow unregistered: ${flow.name}`);
  }

  /**
   * Enable a flow
   * @param {String} flowId - Flow ID
   */
  enableFlow(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    if (flow.enabled) {
      return flow;
    }

    flow.enabled = true;
    this._attachFlowListener(flow);
    logger.info(`✅ Flow enabled: ${flow.name}`);
    return flow;
  }

  /**
   * Disable a flow
   * @param {String} flowId - Flow ID
   */
  disableFlow(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    if (!flow.enabled) {
      return flow;
    }

    flow.enabled = false;
    this._detachFlowListener(flow);
    logger.info(`⏸️  Flow disabled: ${flow.name}`);
    return flow;
  }

  /**
   * Register an action handler
   * @param {String} actionType - Action type identifier
   * @param {Function} handler - Action handler function
   */
  registerAction(actionType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Action handler must be a function');
    }

    this.actions.set(actionType, handler);
    logger.info(`✅ Action registered: ${actionType}`);
  }

  /**
   * Trigger an event manually
   * @param {String} eventName - Event name
   * @param {Object} eventData - Event data
   */
  async triggerEvent(eventName, eventData) {
    if (!this.isRunning) {
      logger.warn('Flow Engine is not running. Event ignored.');
      return;
    }

    logger.info(`📢 Event triggered: ${eventName}`);
    this.emit(eventName, eventData);
  }

  /**
   * Get all registered flows
   */
  getFlows() {
    return Array.from(this.flows.values());
  }

  /**
   * Get flow by ID
   * @param {String} flowId - Flow ID
   */
  getFlow(flowId) {
    return this.flows.get(flowId);
  }

  /**
   * Get execution history
   * @param {Number} limit - Number of records to return
   */
  getExecutionHistory(limit = 50) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get flow statistics
   */
  getStats() {
    const flows = Array.from(this.flows.values());
    return {
      totalFlows: flows.length,
      enabledFlows: flows.filter(f => f.enabled).length,
      disabledFlows: flows.filter(f => !f.enabled).length,
      totalExecutions: flows.reduce((sum, f) => sum + f.executionCount, 0),
      registeredActions: this.actions.size,
      historySize: this.executionHistory.length,
      isRunning: this.isRunning
    };
  }

  /**
   * Attach event listener for a flow
   * @private
   */
  _attachFlowListener(flow) {
    const listener = async (eventData) => {
      await this._executeFlow(flow, eventData);
    };

    // Store listener reference for cleanup
    flow._listener = listener;
    this.on(flow.trigger.event, listener);
  }

  /**
   * Detach event listener for a flow
   * @private
   */
  _detachFlowListener(flow) {
    if (flow._listener) {
      this.removeListener(flow.trigger.event, flow._listener);
      delete flow._listener;
    }
  }

  /**
   * Execute a flow
   * @private
   */
  async _executeFlow(flow, eventData) {
    const executionId = `${flow.id}-${Date.now()}`;
    const startTime = Date.now();

    logger.info(`⚡ Executing flow: ${flow.name} (${executionId})`);

    const execution = {
      id: executionId,
      flowId: flow.id,
      flowName: flow.name,
      trigger: flow.trigger.event,
      startTime: new Date(startTime),
      status: 'running',
      eventData,
      results: []
    };

    try {
      // Check conditions
      const conditionsMet = await this._checkConditions(flow.conditions, eventData);
      
      if (!conditionsMet) {
        execution.status = 'skipped';
        execution.reason = 'Conditions not met';
        logger.info(`⏭️  Flow skipped: ${flow.name} - Conditions not met`);
        this._recordExecution(execution);
        return;
      }

      // Execute actions
      for (const actionDef of flow.actions) {
        const actionResult = await this._executeAction(actionDef, eventData);
        execution.results.push(actionResult);
      }

      // Update flow stats
      flow.executionCount++;
      flow.lastExecuted = new Date();

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = Date.now() - startTime;

      logger.info(`✅ Flow completed: ${flow.name} (${execution.duration}ms)`);
      this.emit('flow:completed', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = new Date();
      execution.duration = Date.now() - startTime;

      logger.error(`❌ Flow failed: ${flow.name} - ${error.message}`);
      this.emit('flow:failed', execution);
    }

    this._recordExecution(execution);
  }

  /**
   * Check if conditions are met
   * @private
   */
  async _checkConditions(conditions, eventData) {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    for (const condition of conditions) {
      const result = await this._evaluateCondition(condition, eventData);
      if (!result) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   * @private
   */
  async _evaluateCondition(condition, eventData) {
    const { field, operator, value } = condition;

    // Get field value from event data
    const fieldValue = this._getNestedValue(eventData, field);

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return Array.isArray(fieldValue) && fieldValue.includes(value);
      case 'not_contains':
        return Array.isArray(fieldValue) && !fieldValue.includes(value);
      case 'greater_than':
        return fieldValue > value;
      case 'less_than':
        return fieldValue < value;
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null;
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue);
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Execute an action
   * @private
   */
  async _executeAction(actionDef, eventData) {
    const { type, params } = actionDef;
    const startTime = Date.now();

    const result = {
      type,
      status: 'pending',
      startTime: new Date(startTime)
    };

    try {
      const handler = this.actions.get(type);
      
      if (!handler) {
        throw new Error(`Action handler not found: ${type}`);
      }

      // Resolve dynamic parameters
      const resolvedParams = this._resolveParams(params, eventData);

      // Execute action
      const actionResult = await handler(resolvedParams, eventData);

      result.status = 'success';
      result.result = actionResult;
      result.endTime = new Date();
      result.duration = Date.now() - startTime;

      logger.info(`✅ Action completed: ${type} (${result.duration}ms)`);

    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      result.endTime = new Date();
      result.duration = Date.now() - startTime;

      logger.error(`❌ Action failed: ${type} - ${error.message}`);
    }

    return result;
  }

  /**
   * Resolve dynamic parameters
   * @private
   */
  _resolveParams(params, eventData) {
    if (!params) return {};

    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Dynamic parameter - extract from event data
        const field = value.slice(2, -2).trim();
        resolved[key] = this._getNestedValue(eventData, field);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Get nested value from object
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Record execution in history
   * @private
   */
  _recordExecution(execution) {
    this.executionHistory.push(execution);

    // Trim history if too large
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }
}

// Singleton instance
const flowEngine = new FlowEngine();

module.exports = flowEngine;
