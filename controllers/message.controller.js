const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const logger = require('../utils/logger');

// Get user conversations
exports.getUserConversations = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const conversations = await Conversation.getUserConversations(userId);
    
    // Get unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.getUnreadCount(conv._id, userId);
        return {
          id: conv._id,
          participants: conv.participants,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount
        };
      })
    );
    
    res.json(conversationsWithUnread);
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

// Get conversation details
exports.getConversationDetails = async (req, res) => {
  try {
    const { conversationId } = req.params;
    // TODO: Implement conversation details retrieval
    res.json({
      id: conversationId,
      participants: [],
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching conversation details:', error);
    res.status(500).json({ error: 'Failed to fetch conversation details' });
  }
};

// Get conversation messages
exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    
    const skip = (page - 1) * limit;
    
    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false
    })
      .populate('sender', 'firstName lastName email')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip(skip);
    
    // Mark messages as read
    await Promise.all(
      messages.map(msg => msg.markAsRead(userId))
    );
    
    res.json(messages.reverse()); // Return in chronological order
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    let { conversationId, message, recipientId } = req.body;
    const senderId = req.user.id;
    
    // If no conversation ID, create or find conversation
    if (!conversationId && recipientId) {
      let conversation = await Conversation.findByParticipants([senderId, recipientId]);
      
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, recipientId],
          type: 'direct'
        });
      }
      
      conversationId = conversation._id;
    }
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID or recipient ID required' });
    }
    
    // Create message
    const newMessage = await Message.create({
      conversation: conversationId,
      sender: senderId,
      message,
      messageType: 'text'
    });
    
    // Update conversation
    const conversation = await Conversation.findById(conversationId);
    await conversation.updateLastMessage(message, senderId);
    
    // Populate sender info
    await newMessage.populate('sender', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    // TODO: Implement mark as read
    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement unread count
    res.json({ count: 0 });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

// Create conversation
exports.createConversation = async (req, res) => {
  try {
    const { participantIds } = req.body;
    // TODO: Implement conversation creation
    res.json({
      success: true,
      conversation: {
        id: 1,
        participants: participantIds,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

// Upload attachment
exports.uploadAttachment = async (req, res) => {
  try {
    // TODO: Implement attachment upload
    res.json({
      success: true,
      attachmentUrl: '/uploads/attachment1.jpg'
    });
  } catch (error) {
    logger.error('Error uploading attachment:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    // TODO: Implement message deletion
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Search messages
exports.searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;
    // TODO: Implement message search
    res.json([]);
  } catch (error) {
    logger.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
};

// Get tenant messages
exports.getTenantMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    // TODO: Implement tenant message retrieval
    res.json([]);
  } catch (error) {
    logger.error('Error fetching tenant messages:', error);
    res.status(500).json({ error: 'Failed to fetch tenant messages' });
  }
};

// Send tenant message
exports.sendTenantMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { to, toName, subject, message, priority } = req.body;
    // TODO: Implement tenant message sending
    res.json({
      success: true,
      message: {
        id: 1,
        from: userId,
        to,
        subject,
        message,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error sending tenant message:', error);
    res.status(500).json({ error: 'Failed to send tenant message' });
  }
};

// Mark message as read
exports.markMessageAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement mark message as read
    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
};

module.exports = exports;
