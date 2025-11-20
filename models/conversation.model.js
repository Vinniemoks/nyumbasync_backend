const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const conversationSchema = new Schema({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['direct', 'group', 'support'],
    default: 'direct'
  },
  title: {
    type: String,
    trim: true
  },
  lastMessage: {
    type: String,
    trim: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Related entities
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property'
  },
  lease: {
    type: Schema.Types.ObjectId,
    ref: 'Lease'
  },
  maintenance: {
    type: Schema.Types.ObjectId,
    ref: 'Maintenance'
  },
  // Metadata
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  mutedBy: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    mutedUntil: Date
  }]
}, {
  timestamps: true
});

// Indexes
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ type: 1, lastMessageAt: -1 });
conversationSchema.index({ property: 1 });
conversationSchema.index({ lease: 1 });

// Methods
conversationSchema.methods.updateLastMessage = async function(message, senderId) {
  this.lastMessage = message;
  this.lastMessageAt = new Date();
  this.lastMessageBy = senderId;
  return this.save();
};

conversationSchema.methods.archiveFor = async function(userId) {
  if (!this.archivedBy.includes(userId)) {
    this.archivedBy.push(userId);
    await this.save();
  }
  return this;
};

conversationSchema.methods.unarchiveFor = async function(userId) {
  this.archivedBy = this.archivedBy.filter(id => id.toString() !== userId.toString());
  return this.save();
};

conversationSchema.methods.muteFor = async function(userId, duration) {
  const existingMute = this.mutedBy.find(m => m.user.toString() === userId.toString());
  
  const mutedUntil = new Date();
  mutedUntil.setHours(mutedUntil.getHours() + (duration || 24));
  
  if (existingMute) {
    existingMute.mutedUntil = mutedUntil;
  } else {
    this.mutedBy.push({
      user: userId,
      mutedUntil
    });
  }
  
  return this.save();
};

// Static methods
conversationSchema.statics.findByParticipants = async function(participantIds) {
  return this.findOne({
    participants: { $all: participantIds, $size: participantIds.length }
  });
};

conversationSchema.statics.getUserConversations = async function(userId, includeArchived = false) {
  const query = {
    participants: userId
  };
  
  if (!includeArchived) {
    query.archivedBy = { $ne: userId };
  }
  
  return this.find(query)
    .populate('participants', 'firstName lastName email phone role')
    .populate('lastMessageBy', 'firstName lastName')
    .sort('-lastMessageAt');
};

module.exports = mongoose.model('Conversation', conversationSchema);
