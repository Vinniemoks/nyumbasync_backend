const socketio = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Conversation = require('../models/conversation.model');

let io;

// Build the Socket.IO CORS allowlist the same way the HTTP layer does. Never
// default to '*' in production (assessment C17).
function buildAllowedOrigins() {
  const list = [
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : []),
    ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN.trim()] : []),
  ];
  if (process.env.NODE_ENV !== 'production') {
    list.push('http://localhost:5000', 'http://localhost:5173', 'http://localhost:3000');
  }
  return list;
}

// True if `userId` is a participant of `conversationId`. Invalid ids resolve to
// false rather than throwing (assessment C14).
async function isConversationParticipant(userId, conversationId) {
  if (!userId || !conversationId) return false;
  try {
    const convo = await Conversation.findOne({ _id: conversationId, participants: userId })
      .select('_id')
      .lean();
    return !!convo;
  } catch (_) {
    return false;
  }
}

// User-to-socket mapping for presence
const userSockets = new Map();

// Room management
const rooms = new Map();

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
function initializeWebSocket(server) {
    const allowedOrigins = buildAllowedOrigins();
    io = socketio(server, {
        cors: {
            origin: (origin, callback) => {
                // Same-origin / native clients send no Origin header.
                if (!origin) return callback(null, true);
                if (allowedOrigins.includes(origin)) return callback(null, true);
                if (process.env.NODE_ENV !== 'production') return callback(null, true);
                return callback(new Error('Socket CORS: origin not allowed'));
            },
            credentials: true,
        },
        pingTimeout: 60000,
    });

    // Authentication middleware — pin the algorithm, read the correct claim,
    // and confirm the account is still active (assessment C2).
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
            // Access tokens carry the `userId` claim (utils/auth.js); tolerate `id`
            // for any legacy tokens still in flight.
            const userId = decoded.userId || decoded.id;
            if (!userId) {
                return next(new Error('Authentication error: Invalid token'));
            }

            const user = await User.findById(userId).select('firstName lastName role isActive status').lean();
            if (!user || user.isActive === false || user.status === 'suspended' || user.status === 'inactive') {
                return next(new Error('Authentication error: Account not active'));
            }

            socket.userId = String(userId);
            socket.userRole = user.role || decoded.role;
            socket.userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || decoded.name || 'User';

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

        // Handle joining conversation rooms — only if the caller is a participant
        // (assessment C14: prevents joining arbitrary rooms / message snooping).
        socket.on('join:conversation', async (conversationId) => {
            if (!(await isConversationParticipant(socket.userId, conversationId))) {
                socket.emit('error', { event: 'join:conversation', message: 'Not a participant' });
                return;
            }
            socket.join(`conversation:${conversationId}`);
        });

        // Handle leaving conversation rooms
        socket.on('leave:conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            console.log(`User ${socket.userId} left conversation ${conversationId}`);
        });

        // Handle sending messages — only participants may broadcast into a room,
        // and the sender identity is taken from the authenticated socket, never
        // from the client payload (assessment C14). Note: authoritative
        // persistence happens via the REST message controller; this is the
        // real-time relay only.
        socket.on('message:send', async (data) => {
            const { conversationId, message } = data || {};
            if (!(await isConversationParticipant(socket.userId, conversationId))) {
                socket.emit('error', { event: 'message:send', message: 'Not a participant' });
                return;
            }
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

        // NOTE: `maintenance:update` and `payment:update` client events were
        // removed (assessment C14). Any authenticated socket could previously
        // emit maintenance/payment updates to arbitrary users. These are now
        // emitted server-side only, from the authorized REST controllers via
        // sendToUser().

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
