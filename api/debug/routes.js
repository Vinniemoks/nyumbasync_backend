const express = require('express');
const router = express.Router();

/**
 * @api {get} /api/debug/routes List all registered routes
 * @apiName GetRoutes
 * @apiGroup Debug
 * @apiDescription Returns a list of all registered routes in the Express application
 */
router.get('/', (req, res) => {
  try {
    // Get the Express app instance
    const app = req.app;
    
    // Extract all routes
    const routes = [];
    const stack = app._router.stack;
    
    stack.forEach((middleware) => {
      if (middleware.route) {
        // Routes registered directly on the app
        const route = middleware.route;
        routes.push({
          path: route.path,
          methods: Object.keys(route.methods).filter(method => route.methods[method]),
          handler: route.stack[0].name || 'anonymous'
        });
      } 
      else if (middleware.name === 'router' || middleware.name === 'bound dispatch') {
        // Router middleware (routes from router.use())
        const router = middleware.handle;
        router.stack.forEach((handler) => {
          const route = handler.route;
          if (route) {
            routes.push({
              path: route.path,
              methods: Object.keys(route.methods).filter(method => route.methods[method]),
              handler: route.stack[0].name || 'anonymous'
            });
          }
        });
      }
    });

    // Return the list of routes
    res.json({
      status: 'success',
      count: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
  } catch (error) {
    console.error('Route debugging error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve routes',
      error: error.message
    });
  }
});

module.exports = router;