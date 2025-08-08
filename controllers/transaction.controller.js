// C:\Users\USER\NyumbaSync\nyumbasync_backend\controllers\transaction.controller.js
const Transaction = require('../models/transaction.model');
const Property = require('../models/property.model');
const User = require('../models/user.model');
const asyncHandler = require('express-async-handler');
const { logTransaction } = require('../utils/logger');
const { generateMPesaSTKPush } = require('../services/mpesa.service');
const { formatPhoneForMPesa } = require('../utils/formatters');

const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const MPESA_BUSINESS_SHORT_CODE = process.env.MPESA_BUSINESS_SHORT_CODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

exports.initiateMpesaPayment = asyncHandler(async (req, res) => {
  const { phone, amount, propertyId, houseNumber } = req.body;
  const userId = req.user._id;
  if (!phone || !amount || !propertyId || !houseNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const properties = await Property.findAvailable({ _id: propertyId });
  if (!properties.length) {
    return res.status(404).json({ error: 'Property not found or not available' });
  }
  const property = properties[0];
  if (!property.houses || !property.houses.length) {
    return res.status(400).json({ error: 'No houses defined for this property' });
  }
  const house = property.houses.find(h => h.number === houseNumber);
  if (!house || house.status !== 'available') {
    return res.status(400).json({ error: 'House not found or not available' });
  }
  const formattedPhone = formatPhoneForMPesa(phone);
  const transactionRef = `NYUMBA${Date.now()}`;
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
  if (!MPESA_CALLBACK_URL || !MPESA_BUSINESS_SHORT_CODE || !MPESA_PASSKEY) {
    throw new Error('M-Pesa configuration is missing');
  }
  const stkResponse = await generateMPesaSTKPush({
    phone: formattedPhone,
    amount,
    reference: transactionRef,
    callbackUrl: MPESA_CALLBACK_URL,
    businessShortCode: MPESA_BUSINESS_SHORT_CODE,
    passKey: MPESA_PASSKEY
  });
  logTransaction(newTransaction._id, 'STK_PUSH_INITIATED', { mpesaResponse: stkResponse });
  res.json({
    message: 'Payment request sent to your phone',
    transactionId: newTransaction._id,
    mpesaResponse: stkResponse
  });
});

exports.handleMpesaCallback = asyncHandler(async (req, res) => {
  const callbackData = req.body;
  if (!callbackData.CallbackMetadata || callbackData.ResultCode !== 0) {
    throw new Error('Invalid M-Pesa callback');
  }
  const metadata = callbackData.CallbackMetadata.Item;
  const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
  const amount = metadata.find(item => item.Name === 'Amount')?.Value;
  const phone = metadata.find(item => item.Name === 'PhoneNumber')?.Value;
  const reference = metadata.find(item => item.Name === 'AccountReference')?.Value;
  if (!mpesaReceipt || !amount || !phone || !reference) {
    throw new Error('Missing callback metadata');
  }
  const transaction = await Transaction.findOneAndUpdate(
    { reference },
    { status: 'completed', mpesaReceipt, completedAt: new Date() },
    { new: true }
  ).populate('user property');
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  const property = await Property.findById(transaction.property);
  if (!property) {
    throw new Error('Property not found');
  }
  const house = property.houses.find(h => h.number === transaction.houseNumber);
  if (!house) {
    throw new Error('House not found');
  }
  await property.markAsOccupied(
    transaction.user._id,
    new Date(),
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    1
  );
  house.status = 'occupied';
  house.tenant = transaction.user._id;
  house.lastPayment = new Date();
  await property.save();
  logTransaction(transaction._id, 'PAYMENT_COMPLETED', { mpesaReceipt });
  res.status(200).send();
});

exports.getTransactionHistory = asyncHandler(async (req, res) => {
  const user = req.user;
  let transactions = [];
  if (user.role === 'landlord') {
    const properties = await Property.findByLandlord(user._id);
    const propertyIds = properties.map(p => p._id);
    transactions = await Transaction.find({ property: { $in: propertyIds } })
      .sort({ createdAt: -1 })
      .populate('property', 'title address');
  } else {
    transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('property', 'title address');
  }
  res.json({ count: transactions.length, transactions });
});

exports.getPropertyTransactions = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.propertyId, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  const transactions = await Transaction.find({ property: req.params.propertyId })
    .populate('user', 'name phone');
  const waterStatus = property.getWaterStatus();
  res.json({ property: property.title, waterStatus, count: transactions.length, transactions });
});

exports.reconcileTransactions = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (startDate && isNaN(new Date(startDate).getTime())) {
    return res.status(400).json({ error: 'Invalid start date' });
  }
  if (endDate && isNaN(new Date(endDate).getTime())) {
    return res.status(400).json({ error: 'Invalid end date' });
  }
  const query = {
    status: 'completed',
    ...(startDate && endDate && {
      completedAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    })
  };
  const transactions = await Transaction.find(query)
    .populate('user property', 'name phone title');
  const rentStats = await Property.getRentStats();
  const totalAmount = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  res.json({
    period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
    transactionCount: transactions.length,
    totalAmount,
    rentStats,
    transactions
  });
});

exports.getTransactionDetails = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.transactionId)
    .populate('user property', 'name phone title');
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && transaction.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }
  const property = await Property.findById(transaction.property);
  if (property) {
    await property.incrementViews();
  }
  res.json(transaction);
});

exports.resendTransactionReceipt = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  const property = await Property.findById(transaction.property);
  if (property) {
    await property.addImage(
      `https://example.com/receipts/${transaction._id}.png`,
      `Receipt for transaction ${transaction.reference}`,
      false
    );
  }
  logTransaction(transaction._id, 'RECEIPT_RESENT');
  res.json({ message: 'Receipt resent successfully' });
});

exports.retryFailedTransaction = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  if (transaction.status !== 'failed') {
    return res.status(400).json({ error: 'Transaction is not failed' });
  }
  const property = await Property.findById(transaction.property);
  if (property && transaction.amount !== property.rent.amount) {
    await property.updateRent(transaction.amount);
  }
  const stkResponse = await generateMPesaSTKPush({
    phone: transaction.phone,
    amount: transaction.amount,
    reference: transaction.reference,
    callbackUrl: MPESA_CALLBACK_URL,
    businessShortCode: MPESA_BUSINESS_SHORT_CODE,
    passKey: MPESA_PASSKEY
  });
  transaction.status = 'pending';
  await transaction.save();
  logTransaction(transaction._id, 'TRANSACTION_RETRY');
  res.json({ message: 'Transaction retry initiated', mpesaResponse: stkResponse });
});

exports.exportTransactionsCSV = asyncHandler(async (req, res) => {
  const { Parser } = require('json2csv');
  const transactions = await Transaction.find().lean();
  const areaStats = await Property.getAreaStats();
  const data = transactions.map(txn => ({
    ...txn,
    areaStats: areaStats.find(stat => stat._id === txn.property?.address?.area) || {}
  }));
  const fields = [
    'reference',
    'amount',
    'status',
    'createdAt',
    'completedAt',
    'areaStats.count',
    'areaStats.averageRent'
  ];
  const parser = new Parser({ fields });
  const csv = parser.parse(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(csv);
});