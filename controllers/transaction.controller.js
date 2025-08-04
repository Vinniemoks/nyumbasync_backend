const Transaction = require('../models/transaction.model');
const Property = require('../../models/property.model');
const Property = require('../../models/property.model'); 
const User = require('../../models/user.model');
const axios = require('axios');
const { logTransaction } = require('../../utils/logger');
const { generateMPesaSTKPush } = require('../../services/mpesa.service');
const { formatPhoneForMPesa } = require('../../utils/formatters');

// Constants for M-Pesa
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const MPESA_BUSINESS_SHORT_CODE = process.env.MPESA_BUSINESS_SHORT_CODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

/**
 * Initiate M-Pesa STK Push payment
 */
exports.initiateMpesaPayment = async (req, res) => {
  try {
    const { phone, amount, propertyId, houseNumber } = req.body;
    const userId = req.user._id;

    // 1. Validate property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // 2. Format phone number for M-Pesa (2547... format)
    const formattedPhone = formatPhoneForMPesa(phone);

    // 3. Generate unique transaction reference
    const transactionRef = `NYUMBA${Date.now()}`;

    // 4. Create transaction record
    const newTransaction = await Transaction.create({
      user: userId,
      property: propertyId,
      houseNumber,
      amount,
      phone: formattedPhone,
      reference: transactionRef,
      type: 'rent',
      status: 'pending'
    });

    // 5. Initiate STK Push
    const stkResponse = await generateMPesaSTKPush({
      phone: formattedPhone,
      amount,
      reference: transactionRef,
      callbackUrl: MPESA_CALLBACK_URL,
      businessShortCode: MPESA_BUSINESS_SHORT_CODE,
      passKey: MPESA_PASSKEY
    });

    // 6. Log and respond
    logTransaction(newTransaction._id, 'STK_PUSH_INITIATED', { mpesaResponse: stkResponse });

    res.json({
      message: 'Payment request sent to your phone',
      transactionId: newTransaction._id,
      mpesaResponse: stkResponse
    });

  } catch (error) {
    logTransaction(null, 'STK_PUSH_FAILED', { error: error.message });
    res.status(500).json({ 
      error: 'Payment initiation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Handle M-Pesa callback
 */
exports.handleMpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    // 1. Verify callback is from M-Pesa
    if (!callbackData.CallbackMetadata || !callbackData.ResultCode === 0) {
      throw new Error('Invalid M-Pesa callback');
    }

    // 2. Extract transaction details
    const metadata = callbackData.CallbackMetadata.Item;
    const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber').Value;
    const amount = metadata.find(item => item.Name === 'Amount').Value;
    const phone = metadata.find(item => item.Name === 'PhoneNumber').Value;
    const reference = metadata.find(item => item.Name === 'AccountReference').Value;

    // 3. Find and update transaction
    const transaction = await Transaction.findOneAndUpdate(
      { reference },
      {
        status: 'completed',
        mpesaReceipt: mpesaReceipt,
        completedAt: new Date()
      },
      { new: true }
    ).populate('user property');

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // 4. Update property payment status
    await Property.updateOne(
      { _id: transaction.property, 'houses.number': transaction.houseNumber },
      { $set: { 'houses.$.lastPayment': new Date() } }
    );

    // 5. Log successful transaction
    logTransaction(transaction._id, 'PAYMENT_COMPLETED', { mpesaReceipt });

    // 6. Send payment confirmation (you'd implement this)
    // await sendPaymentConfirmation(transaction.user.phone, amount, mpesaReceipt);

    res.status(200).send(); // M-Pesa expects empty 200 response

  } catch (error) {
    logTransaction(null, 'CALLBACK_HANDLING_FAILED', { error: error.message });
    res.status(500).send();
  }
};

/**
 * Get transaction history for user
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('property', 'name location');

    res.json({
      count: transactions.length,
      transactions
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

/**
 * Get transactions for a specific property (Landlord view)
 */
exports.getPropertyTransactions = async (req, res) => {
  try {
    // Verify landlord owns the property
    const property = await Property.findOne({
      _id: req.params.propertyId,
      landlord: req.user._id
    });

    if (!property) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const transactions = await Transaction.find({ 
      property: req.params.propertyId 
    }).populate('user', 'name phone');

    res.json({
      property: property.name,
      count: transactions.length,
      transactions
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch property transactions' });
  }
};

/**
 * Transaction reconciliation (Admin only)
 */
exports.reconcileTransactions = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {
      status: 'completed',
      ...(startDate && endDate && {
        completedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      })
    };

    const transactions = await Transaction.find(query)
      .populate('user property', 'name phone location');

    const totalAmount = transactions.reduce((sum, txn) => sum + txn.amount, 0);

    res.json({
      period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
      transactionCount: transactions.length,
      totalAmount,
      transactions
    });

  } catch (error) {
    res.status(500).json({ error: 'Reconciliation failed' });
  }
};

/**
 * Get transaction details
 */
exports.getTransactionDetails = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId)
      .populate('user property', 'name phone location');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Verify ownership (user or admin)
    if (!req.user.roles.includes('admin') && transaction.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.json(transaction);

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction details' });
  }
};

