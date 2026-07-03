const mongoose = require('mongoose');
const { Schema } = mongoose;

// A landlord/manager/agent request to move collected rent out of the platform
// to M-Pesa or a bank account. Created only after an MFA step-up; actual
// disbursement (Daraja B2C / bank rails) is processed from the queue, so a
// request starts life as `queued`.
const WithdrawalSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Withdrawal must belong to a user'],
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Withdrawal amount is required'],
    min: [100, 'Minimum withdrawal is KES 100'],
    set: v => Math.round(v)
  },
  currency: { type: String, default: 'KES', enum: ['KES'] },
  method: {
    type: String,
    required: [true, 'Withdrawal method is required'],
    enum: { values: ['mpesa', 'bank'], message: 'Method must be mpesa or bank' }
  },
  destination: {
    phone: { type: String, trim: true },          // mpesa
    bankName: { type: String, trim: true },        // bank
    accountName: { type: String, trim: true },
    accountNumber: { type: String, trim: true }
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'queued'
  },
  reference: {
    type: String,
    unique: true,
    default: () =>
      `WD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  },
  failureReason: String,
  processedAt: Date,
  // Which second factor authorized the request (audit trail).
  mfaMethod: { type: String, enum: ['totp', 'backup_code', 'email_otp'] }
}, { timestamps: true });

WithdrawalSchema.index({ user: 1, createdAt: -1 });
WithdrawalSchema.index({ status: 1, createdAt: 1 });

// Total that is spoken for (already out or on its way out) for a user.
WithdrawalSchema.statics.totalWithdrawn = async function(userId) {
  const rows = await this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)), status: { $in: ['queued', 'processing', 'completed'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return rows[0]?.total || 0;
};

module.exports = mongoose.model('Withdrawal', WithdrawalSchema);
