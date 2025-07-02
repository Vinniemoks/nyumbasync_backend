const User = require('../models/user.model');
const { mpesaSTKPush } = require('../services/mpesa.service');
const { generateJWT } = require('../utils/auth');

// Kenyan phone registration
exports.registerWithPhone = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate Kenyan format
    if (!/^254[17]\d{8}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid Kenyan phone format' });
    }

    // M-Pesa STK push for verification
    const verificationCode = Math.floor(1000 + Math.random() * 9000);
    await mpesaSTKPush(phone, 1, `NyumbaSync verification code: ${verificationCode}`);

    // Save user with temp code (expires in 10 mins)
    const user = await User.findOneAndUpdate(
      { phone },
      { 
        verificationCode,
        codeExpires: new Date(Date.now() + 600000) // 10 minutes
      },
      { upsert: true, new: true }
    );

    res.status(202).json({
      message: 'Verification code sent via M-Pesa',
      tempId: user._id
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to initiate registration',
      localAction: 'Retry or use USSD *544#' 
    });
  }
};

// Verify code and issue JWT
exports.verifyCode = async (req, res) => {
  const { phone, code } = req.body;

  const user = await User.findOne({
    phone,
    codeExpires: { $gt: new Date() }
  });

  if (!user || user.verificationCode !== code) {
    return res.status(400).json({ 
      error: 'Invalid or expired code',
      solution: 'Request new code via M-Pesa'
    });
  }

  // Mark as verified and generate token
  user.mpesaVerified = true;
  user.verificationCode = undefined;
  await user.save();

  const token = generateJWT({
    id: user._id,
    phone: user.phone,
    role: user.role
  });

  res.json({ 
    token,
    user: {
      id: user._id,
      role: user.role,
      kraPin: user.kraPin // For landlord tax reporting
    }
  });
};
