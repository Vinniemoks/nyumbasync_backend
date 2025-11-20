/**
 * Flow Actions Library
 * Reusable actions for the Flow Engine
 */

const emailActions = require('./emailActions');
const smsActions = require('./smsActions');
const taskActions = require('./taskActions');
const notificationActions = require('./notificationActions');
const dataActions = require('./dataActions');

module.exports = {
  ...emailActions,
  ...smsActions,
  ...taskActions,
  ...notificationActions,
  ...dataActions
};
