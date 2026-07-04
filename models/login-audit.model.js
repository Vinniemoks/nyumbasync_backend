const mongoose = require('mongoose');

// One document per login attempt — success or failure — so admins can see
// who signed in (or tried to) from where. Written fire-and-forget by
// auth.controller; never blocks the login path.
const loginAuditSchema = new mongoose.Schema(
  {
    // What the caller typed (email or phone), normalized lowercase.
    identifier: { type: String, index: true },
    // Set when the identifier matched an account.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: String,
    role: String,
    success: { type: Boolean, required: true, index: true },
    // Why a failure failed / how a success authenticated.
    // e.g. 'ok', 'ok_mfa_pending', 'wrong_password', 'unknown_identifier',
    //      'account_locked', 'invalid_input'
    reason: { type: String, required: true },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Newest-first queries dominate; expire entries after 180 days.
loginAuditSchema.index({ createdAt: -1 });
loginAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('LoginAudit', loginAuditSchema);
