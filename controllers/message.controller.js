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
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'firstName lastName email phone role')
      .populate('lastMessageBy', 'firstName lastName');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
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
    const userId = req.body.userId || req.user.id;

    await Message.updateMany(
      {
        conversation: conversationId,
        'readBy.user': { $ne: userId }
      },
      {
        $addToSet: { readBy: { user: userId, readAt: new Date() } }
      }
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    // Get all conversations this user is part of
    const conversations = await Conversation.find({ participants: userId });
    const conversationIds = conversations.map(c => c._id);

    const count = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isDeleted: false
    });

    res.json({ count });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

// Create conversation
exports.createConversation = async (req, res) => {
  try {
    const { participantIds, type = 'direct', title } = req.body;
    const userId = req.user.id;

    if (!participantIds || participantIds.length === 0) {
      return res.status(400).json({ error: 'participantIds required' });
    }

    // Include current user
    const allParticipants = [...new Set([userId, ...participantIds])];

    // For direct messages, check if conversation already exists
    if (type === 'direct' && allParticipants.length === 2) {
      let existing = await Conversation.findByParticipants(allParticipants);
      if (existing) {
        return res.json({ success: true, conversation: existing });
      }
    }

    const conversation = await Conversation.create({
      participants: allParticipants,
      type,
      title
    });

    await conversation.populate('participants', 'firstName lastName email role');

    res.status(201).json({ success: true, conversation });
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

// Upload attachment
exports.uploadAttachment = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
      success: true,
      attachmentUrl: file.path,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size
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
    const userId = req.user.id;

    const message = await Message.findOneAndUpdate(
      { _id: messageId, sender: userId },
      { $set: { isDeleted: true, message: '[Message deleted]' } },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

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

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const messages = await Message.find({
      conversation: conversationId,
      message: { $regex: q, $options: 'i' },
      isDeleted: false
    })
      .populate('sender', 'firstName lastName email')
      .sort('-createdAt')
      .limit(50);

    res.json(messages);
  } catch (error) {
    logger.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
};

// Get tenant messages
exports.getTenantMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'firstName lastName email role')
      .sort('-lastMessageAt')
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: userId },
          'readBy.user': { $ne: userId },
          isDeleted: false
        });
        return { ...conv.toObject(), unreadCount };
      })
    );

    res.json(conversationsWithUnread);
  } catch (error) {
    logger.error('Error fetching tenant messages:', error);
    res.status(500).json({ error: 'Failed to fetch tenant messages' });
  }
};

// Send tenant message
exports.sendTenantMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { to, subject, message, priority } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Recipient and message are required' });
    }

    // Find or create conversation
    let conversation = await Conversation.findByParticipants([senderId, to]);
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, to],
        type: 'direct',
        title: subject
      });
    }

    const newMessage = await Message.create({
      conversation: conversation._id,
      sender: senderId,
      message,
      messageType: 'text',
      metadata: { subject, priority }
    });

    await conversation.updateLastMessage(message, senderId);
    await newMessage.populate('sender', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: newMessage
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
    const userId = req.user.id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await message.markAsRead(userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
};

module.exports = exports;
