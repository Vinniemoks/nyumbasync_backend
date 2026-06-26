const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const { check, validationResult } = require('express-validator');

// @route   GET api/v1/payments/history
// @desc    Get payment history for authenticated user
// @access  Private (Tenant/Landlord)
router.get('/history', auth, async (req, res) => {
  try {
    // Determine user type and set appropriate query
    const query = req.user.role === 'landlord' 
      ? { landlord: req.user.id } 
      : { tenant: req.user.id };

    const payments = await Payment.find(query)
      .sort('-paymentDate')
      .populate('property', ['title', 'address'])
      .populate('tenant', ['name', 'phone'])
      .populate('landlord', ['name', 'phone']);

    res.json(payments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/v1/payments
// @desc    Create a new payment record
// @access  Private (Tenant)
router.post(
  '/',
  [
    auth,
    [
      check('property', 'Property ID is required').not().isEmpty(),
      check('amount', 'Amount is required and must be numeric').isNumeric(),
      check('mpesaCode', 'MPesa transaction code is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { property, amount, mpesaCode, description } = req.body;

    try {
      // Verify user is a tenant
      if (req.user.role !== 'tenant') {
        return res.status(403).json({ msg: 'Only tenants can make payments' });
      }

      // Get property details to get landlord
      const propertyObj = await Property.findById(property);
      if (!propertyObj) {
        return res.status(404).json({ msg: 'Property not found' });
      }

      const newPayment = new Payment({
        tenant: req.user.id,
        landlord: propertyObj.landlord,
        property,
        amount,
        mpesaCode,
        description: description || `Rent payment for ${propertyObj.title}`,
        paymentDate: Date.now(),
        status: 'completed'
      });

      const payment = await newPayment.save();

      // Update property with last payment date
      propertyObj.lastPayment = Date.now();
      await propertyObj.save();

      res.json(payment);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/v1/payments/:id
// @desc    Get payment by ID
// @access  Private (Tenant/Landlord involved)
router.get('/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('property', ['title', 'address'])
      .populate('tenant', ['name', 'phone'])
      .populate('landlord', ['name', 'phone']);

    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }

    // Verify requesting user is either tenant or landlord for this payment
    if (
      payment.tenant._id.toString() !== req.user.id &&
      payment.landlord._id.toString() !== req.user.id
    ) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    res.json(payment);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/v1/payments/:id/verify
// @desc    Verify a payment (Landlord action)
// @access  Private (Landlord)
router.put('/:id/verify', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }

    // Verify requesting user is the landlord for this payment
    if (payment.landlord.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    // Update payment status
    payment.status = 'verified';
    payment.verifiedDate = Date.now();
    await payment.save();

    res.json(payment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;