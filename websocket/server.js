const socketio = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

// User-to-socket mapping for presence
const userSockets = new Map();

// Room management
const rooms = new Map();

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
function initializeWebSocket(server) {
    io = socketio(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true,
        },
        pingTimeout: 60000,
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            socket.userName = decoded.name;

            next();
        } catch (error) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    // Connection event
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId} (${socket.userName})`);

        // Store user socket connection
        userSockets.set(socket.userId, socket.id);

        // Emit online status
        socket.broadcast.emit('user:online', {
            userId: socket.userId,
            userName: socket.userName,
        });

        // Join user's personal room
        socket.join(`user:${socket.userId}`);

        // Handle joining conversation rooms
        socket.on('join:conversation', (conversationId) => {
            socket.join(`conversation:${conversationId}`);
            console.log(`User ${socket.userId} joined conversation ${conversationId}`);
        });

        // Handle leaving conversation rooms
        socket.on('leave:conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            console.log(`User ${socket.userId} left conversation ${conversationId}`);
        });

        // Handle sending messages
        socket.on('message:send', (data) => {
            const { conversationId, message } = data;

            // Broadcast to conversation room
            io.to(`conversation:${conversationId}`).emit('message:received', {
                conversationId,
                message,
                sender: {
                    id: socket.userId,
                    name: socket.userName,
                    role: socket.userRole,
                },
                timestamp: new Date(),
            });
        });

        // Handle typing indicators
        socket.on('message:typing', (data) => {
            const { conversationId, isTyping } = data;

            socket.to(`conversation:${conversationId}`).emit('user:typing', {
                userId: socket.userId,
                userName: socket.userName,
                isTyping,
            });
        });

        // Handle message read receipts
        socket.on('message:read', (data) => {
            const { conversationId, messageId } = data;

            socket.to(`conversation:${conversationId}`).emit('message:read', {
                messageId,
                readBy: socket.userId,
                readAt: new Date(),
            });
        });

        // Handle maintenance request updates
        socket.on('maintenance:update', (data) => {
            const { requestId, update } = data;

            // Notify landlord and tenant
            io.to(`user:${update.landlordId}`).emit('maintenance:updated', {
                requestId,
                update,
            });

            if (update.tenantId) {
                io.to(`user:${update.tenantId}`).emit('maintenance:updated', {
                    requestId,
                    update,
                });
            }
        });

        // Handle payment notifications
        socket.on('payment:update', (data) => {
            const { transactionId, status, userId } = data;

            io.to(`user:${userId}`).emit('payment:status', {
                transactionId,
                status,
                timestamp: new Date(),
            });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.userId}`);
            userSockets.delete(socket.userId);

            // Emit offline status
            socket.broadcast.emit('user:offline', {
                userId: socket.userId,
            });
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error for user ${socket.userId}:`, error);
        });
    });

    console.log('WebSocket server initialized');
    return io;
}

/**
 * Get Socket.io instance
 * @returns {SocketIO.Server}
 */
function getIO() {
    if (!io) {
        throw new Error('WebSocket server not initialized');
    }
    return io;
}

/**
 * Send notification to specific user
 * @param {String} userId - User ID
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
function sendToUser(userId, event, data) {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
}

/**
 * Send notification to conversation
 * @param {String} conversationId - Conversation ID
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
function sendToConversation(conversationId, event, data) {
    if (io) {
        io.to(`conversation:${conversationId}`).emit(event, data);
    }
}

/**
 * Broadcast to all connected clients
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
function broadcast(event, data) {
    if (io) {
        io.emit(event, data);
    }
}

/**
 * Get online status of a user
 * @param {String} userId - User ID
 * @returns {Boolean}
 */
function isUserOnline(userId) {
    return userSockets.has(userId);
}

/**
 * Get count of connected clients
 * @returns {Number}
 */
function getConnectedCount() {
    return io ? io.sockets.sockets.size : 0;
}

module.exports = {
    initializeWebSocket,
    getIO,
    sendToUser,
    sendToConversation,
    broadcast,
    isUserOnline,
    getConnectedCount,
};
