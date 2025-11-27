/**
 * Server initialization with WebSocket support
 * This file sets up HTTP server and initializes WebSocket
 */

const http = require('http');
const app = require('./server');
const { initializeWebSocket } = require('./websocket/server');

const PORT = process.env.PORT || 10000;

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize WebSocket
    const io = initializeWebSocket(httpServer);
    console.log('✅ WebSocket server initialized');

    // Start listening
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 WebSocket available at ws://localhost:${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
        console.log(`\n${signal} received. Starting graceful shutdown...`);

        httpServer.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });

        // Force shutdown after 30s
        setTimeout(() => {
            console.error('Forced shutdown');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app };
