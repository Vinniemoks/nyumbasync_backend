const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/auth.middleware');
const messageController = require('../../controllers/message.controller');

module.exports = [
  // Get conversations for user
  {
    method: 'GET',
    path: '/conversations/:userId',
    handler: [authenticate(), asyncHandler(messageController.getUserConversations)],
    config: { source: 'message.routes' }
  },
  
  // Get conversation details
  {
    method: 'GET',
    path: '/conversations/details/:conversationId',
    handler: [authenticate(), asyncHandler(messageController.getConversationDetails)],
    config: { source: 'message.routes' }
  },
  
  // Get messages in conversation
  {
    method: 'GET',
    path: '/:conversationId',
    handler: [authenticate(), asyncHandler(messageController.getConversationMessages)],
    config: { source: 'message.routes' }
  },
  
  // Send message
  {
    method: 'POST',
    path: '/send',
    handler: [authenticate(), asyncHandler(messageController.sendMessage)],
    config: { source: 'message.routes' }
  },
  
  // Mark messages as read
  {
    method: 'PUT',
    path: '/:conversationId/read',
    handler: [authenticate(), asyncHandler(messageController.markMessagesAsRead)],
    config: { source: 'message.routes' }
  },
  
  // Get unread message count
  {
    method: 'GET',
    path: '/unread-count/:userId',
    handler: [authenticate(), asyncHandler(messageController.getUnreadCount)],
    config: { source: 'message.routes' }
  },
  
  // Create new conversation
  {
    method: 'POST',
    path: '/conversations',
    handler: [authenticate(), asyncHandler(messageController.createConversation)],
    config: { source: 'message.routes' }
  },
  
  // Upload message attachment
  {
    method: 'POST',
    path: '/attachments',
    handler: [authenticate(), asyncHandler(messageController.uploadAttachment)],
    config: { source: 'message.routes' }
  },
  
  // Delete message
  {
    method: 'DELETE',
    path: '/:messageId',
    handler: [authenticate(), asyncHandler(messageController.deleteMessage)],
    config: { source: 'message.routes' }
  },
  
  // Search messages in conversation
  {
    method: 'GET',
    path: '/:conversationId/search',
    handler: [authenticate(), asyncHandler(messageController.searchMessages)],
    config: { source: 'message.routes' }
  }
];
