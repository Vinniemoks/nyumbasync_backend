/**
 * Route Adapter
 *
 * Several route modules export an array of declarative route definitions
 * ({ method, path, handler, config }) instead of an Express router. Express
 * cannot mount those arrays directly — router.use() requires middleware
 * functions — so this adapter converts them into a real Router.
 */

const express = require('express');

/**
 * Build an Express router from an array of route definitions.
 * @param {Array<{method: string, path: string, handler: Function|Function[]}>} defs
 * @param {string} sourceName - used in error messages
 */
function buildRouter(defs, sourceName = 'routes') {
  const router = express.Router();

  defs.forEach((def, i) => {
    const method = String(def.method || '').toLowerCase();
    if (typeof router[method] !== 'function') {
      throw new Error(`${sourceName}[${i}]: unsupported HTTP method "${def.method}"`);
    }
    if (!def.path) {
      throw new Error(`${sourceName}[${i}]: missing path`);
    }

    // Handler lists may nest express-validator chains (arrays) — flatten.
    const handlers = (Array.isArray(def.handler) ? def.handler : [def.handler]).flat(Infinity);
    handlers.forEach((h, j) => {
      if (typeof h !== 'function') {
        throw new Error(
          `${sourceName}[${i}] ${def.method} ${def.path}: handler[${j}] is not a function — check the controller export`
        );
      }
    });

    router[method](def.path, ...handlers);
  });

  return router;
}

/**
 * Accept either an Express router (pass-through) or an array of route
 * definitions (converted). Lets route modules use either style.
 */
function asRouter(routes, sourceName) {
  return Array.isArray(routes) ? buildRouter(routes, sourceName) : routes;
}

module.exports = { buildRouter, asRouter };
