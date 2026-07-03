const crypto = require('crypto');
const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const Withdrawal = require('../models/withdrawal.model');
const User = require('../models/user.model');
const mfaService = require('../services/mfa.service');
const emailService = require('../services/emailService');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_PURPOSE = 'withdrawal';

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// Money the user has actually collected on the platform.
const collectedFor = async (userId) => {
  const rows = await Payment.aggregate([
    { $match: { landlord: new mongoose.Types.ObjectId(String(userId)), status: { $in: ['completed', 'verified'] } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  return { collected: rows[0]?.total || 0, paymentCount: rows[0]?.count || 0 };
};

// GET /withdrawals/balance — collected vs withdrawn vs available.
exports.getBalance = async (req, res) => {
  try {
    const [{ collected, paymentCount }, withdrawn] = await Promise.all([
      collectedFor(req.user.id),
      Withdrawal.totalWithdrawn(req.user.id)
    ]);
    return res.json({
      currency: 'KES',
      collected,
      paymentCount,
      withdrawn,
      available: Math.max(0, collected - withdrawn)
    });
  } catch (err) {
    console.error('WITHDRAWAL_BALANCE_FAILURE:', err);
    return res.status(500).json({ error: 'Could not compute your balance' });
  }
};

// POST /withdrawals/otp — email a one-time withdrawal code (for accounts
// without an authenticator app). WhatsApp delivery slots in here once
// credentials are configured.
exports.requestOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.email) {
      return res.status(400).json({ error: 'Your account has no email address for code delivery' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    user.actionOtp = sha256(code);
    user.actionOtpExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.actionOtpPurpose = OTP_PURPOSE;
    await user.save({ validateBeforeSave: false });

    const sent = await emailService.sendEmail({
      to: user.email,
      subject: 'Your NyumbaSync withdrawal code',
      text: `Your withdrawal verification code is ${code}. It expires in 10 minutes. If you did not request a withdrawal, change your password immediately.`,
      html: `<p>Your withdrawal verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you did not request a withdrawal, change your password immediately.</p>`
    });

    if (sent === false) {
      // Email provider not configured — don't leave the user stuck with a
      // code they can never receive.
      return res.status(503).json({
        error: 'Email delivery is not configured on the server, so a code cannot be sent. Set up an authenticator app (MFA) instead, or contact support.'
      });
    }

    return res.json({ success: true, message: `A verification code was sent to ${user.email.replace(/(.{2}).+(@.+)/, '$1***$2')}. It expires in 10 minutes.` });
  } catch (err) {
    console.error('WITHDRAWAL_OTP_FAILURE:', err);
    return res.status(500).json({ error: 'Could not send a verification code' });
  }
};

// Verify whichever second factor the request carries. Returns the method
// string on success, or null.
const verifySecondFactor = async (userId, { totpToken, backupCode, otp }) => {
  const user = await User.findById(userId).select('+mfaSecret +mfaBackupCodes +actionOtp');

  if (totpToken && user.mfaEnabled && user.mfaSecret) {
    if (mfaService.verifyToken(user.mfaSecret, totpToken)) return 'totp';
  }

  if (backupCode && user.mfaEnabled && Array.isArray(user.mfaBackupCodes)) {
    const hash = sha256(backupCode);
    const idx = user.mfaBackupCodes.findIndex((c) => c === hash || c?.code === hash);
    if (idx >= 0) {
      user.mfaBackupCodes.splice(idx, 1); // single-use
      await user.save({ validateBeforeSave: false });
      return 'backup_code';
    }
  }

  if (otp && user.actionOtp && user.actionOtpPurpose === OTP_PURPOSE) {
    const fresh = user.actionOtpExpiry && user.actionOtpExpiry > new Date();
    if (fresh && sha256(otp) === user.actionOtp) {
      user.actionOtp = undefined;
      user.actionOtpExpiry = undefined;
      user.actionOtpPurpose = undefined;
      await user.save({ validateBeforeSave: false });
      return 'email_otp';
    }
  }

  return null;
};

// POST /withdrawals — create an MFA-verified withdrawal request.
exports.createWithdrawal = async (req, res) => {
  try {
    const { amount, method, destination = {}, totpToken, backupCode, otp } = req.body;

    const amt = Math.round(Number(amount));
    if (!Number.isInteger(amt) || amt < 100) {
      return res.status(400).json({ error: 'Amount must be a whole number of at least KES 100' });
    }

    if (method === 'mpesa') {
      const phone = String(destination.phone || '').replace(/\D/g, '').replace(/^0/, '254');
      if (!/^254(7|1)\d{8}$/.test(phone)) {
        return res.status(400).json({ error: 'A valid M-Pesa phone number is required' });
      }
      destination.phone = phone;
    } else if (method === 'bank') {
      if (!destination.bankName || !destination.accountName || !destination.accountNumber) {
        return res.status(400).json({ error: 'Bank name, account name and account number are required' });
      }
    } else {
      return res.status(400).json({ error: 'Method must be mpesa or bank' });
    }

    // MFA step-up — a withdrawal never goes through on a session token alone.
    const mfaMethod = await verifySecondFactor(req.user.id, { totpToken, backupCode, otp });
    if (!mfaMethod) {
      const user = await User.findById(req.user.id).select('mfaEnabled');
      return res.status(401).json({
        error: 'Verification required. Enter the code from your authenticator app or request an email code.',
        mfaRequired: true,
        methods: user.mfaEnabled ? ['totp', 'backup_code', 'email_otp'] : ['email_otp']
      });
    }

    // Funds check AFTER MFA so probing balances requires a verified second factor.
    const [{ collected }, withdrawn] = await Promise.all([
      collectedFor(req.user.id),
      Withdrawal.totalWithdrawn(req.user.id)
    ]);
    const available = Math.max(0, collected - withdrawn);
    if (amt > available) {
      return res.status(400).json({ error: `Amount exceeds your available balance of KES ${available.toLocaleString()}` });
    }

    const withdrawal = await Withdrawal.create({
      user: req.user.id,
      amount: amt,
      method,
      destination,
      mfaMethod
    });

    return res.status(201).json({
      success: true,
      withdrawal: {
        id: withdrawal._id,
        reference: withdrawal.reference,
        amount: withdrawal.amount,
        method: withdrawal.method,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt
      },
      message: `Withdrawal ${withdrawal.reference} queued. ${method === 'mpesa' ? 'It will be sent to your M-Pesa shortly.' : 'Bank transfers are processed within 1–2 business days.'}`
    });
  } catch (err) {
    console.error('WITHDRAWAL_CREATE_FAILURE:', err);
    return res.status(500).json({ error: 'Could not create the withdrawal' });
  }
};

// GET /withdrawals — the user's withdrawal history.
exports.listWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('-__v');
    return res.json({ count: withdrawals.length, withdrawals });
  } catch (err) {
    console.error('WITHDRAWAL_LIST_FAILURE:', err);
    return res.status(500).json({ error: 'Could not load withdrawals' });
  }
};
