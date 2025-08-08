// C:\Users\USER\NyumbaSync\nyumbasync_backend\controllers\property.controller.js
const Property = require('../models/property.model');
const asyncHandler = require('express-async-handler');
const { validateRentIncrease } = require('../utils/kenyanValidators');

// ADD MISSING FUNCTION: getAvailableProperties (called by route)
exports.getAvailableProperties = asyncHandler(async (req, res) => {
  const { lng, lat, maxDistance = 5000, maxRent, city, area, type, bedrooms, amenities } = req.query;
  const filters = { city, area, type, bedrooms, amenities };
  if (maxRent) {
    filters.maxRent = parseInt(maxRent);
  }
  if (lng && lat) {
    filters.coordinates = {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: parseInt(maxDistance)
      }
    };
  }
  const properties = await Property.findAvailable(filters);
  res.json({ count: properties.length, properties });
});

exports.searchProperties = asyncHandler(async (req, res) => {
  const { lng, lat, maxDistance = 5000, maxRent, city, area, type, bedrooms, amenities } = req.query;
  const filters = { city, area, type, bedrooms, amenities };
  if (maxRent) {
    filters.maxRent = parseInt(maxRent);
  }
  if (lng && lat) {
    filters.coordinates = {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: parseInt(maxDistance)
      }
    };
  }
  const properties = await Property.findAvailable(filters);
  res.json({ count: properties.length, properties });
});

// RENAME FUNCTION: getProperty -> getPropertyDetails (to match route)
exports.getPropertyDetails = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id).populate('landlord', 'name phone');
  if (!property) {
    return res.status(404).json({ error: 'Property not found' });
  }
  await property.incrementViews();
  res.json({
    ...property.toJSON(),
    waterStatus: property.getWaterStatus()
  });
});

// KEEP ORIGINAL FUNCTION NAME TOO (in case it's used elsewhere)
exports.getProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id).populate('landlord', 'name phone');
  if (!property) {
    return res.status(404).json({ error: 'Property not found' });
  }
  await property.incrementViews();
  res.json({
    ...property.toJSON(),
    waterStatus: property.getWaterStatus()
  });
});

exports.createProperty = asyncHandler(async (req, res) => {
  const { rent, deposit, houses } = req.body;
  if (deposit > rent.amount * 3) {
    return res.status(400).json({ error: 'Deposit cannot exceed 3 months rent per Kenyan law' });
  }
  const property = await Property.create({
    ...req.body,
    landlord: req.user._id,
    status: 'available',
    isAvailable: true,
    houses: houses || []
  });
  res.status(201).json(property);
});

exports.updateProperty = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  const updated = await Property.findByIdAndUpdate(
    req.params.id,
    { ...req.body, landlord: req.user._id },
    { new: true, runValidators: true }
  );
  res.json(updated);
});

exports.updatePropertyRent = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  if (!validateRentIncrease(property.rent.amount, req.body.amount)) {
    return res.status(400).json({
      error: 'Maximum 7% annual increase allowed',
      currentRent: property.rent.amount,
      allowedNewRent: property.rent.amount * 1.07
    });
  }
  await property.updateRent(req.body.amount);
  res.json({ message: 'Rent updated successfully', property });
});

exports.deleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findOneAndDelete({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  res.json({ 
    message: 'Property listing removed',
    refundNotice: 'Any deposits must be refunded within 14 days' 
  });
});

exports.getAreaStats = asyncHandler(async (req, res) => {
  const stats = await Property.getAreaStats();
  res.json(stats);
});

exports.getRentStats = asyncHandler(async (req, res) => {
  const stats = await Property.getRentStats();
  res.json(stats);
});

exports.getLandlordProperties = asyncHandler(async (req, res) => {
  const properties = await Property.findByLandlord(req.user._id);
  res.json({ count: properties.length, properties });
});

exports.addPropertyImage = asyncHandler(async (req, res) => {
  const { url, caption, isPrimary } = req.body;
  const property = await Property.findOne({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  await property.addImage(url, caption, isPrimary);
  res.json({ message: 'Image added successfully', property });
});

exports.markPropertyAvailable = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  await property.markAsAvailable();
  res.json({ message: 'Property marked as available', property });
});

exports.markHouseOccupied = asyncHandler(async (req, res) => {
  const { tenantId, leaseStart, leaseEnd, houseNumber, rentDueDate } = req.body;
  const property = await Property.findOne({ _id: req.params.id, landlord: req.user._id });
  if (!property) {
    return res.status(403).json({ error: 'Unauthorized or property not found' });
  }
  if (!property.houses || !property.houses.find(h => h.number === houseNumber)) {
    return res.status(400).json({ error: 'House not found' });
  }
  const house = property.houses.find(h => h.number === houseNumber);
  if (house.status !== 'available') {
    return res.status(400).json({ error: 'House is not available' });
  }
  await property.markAsOccupied(tenantId, new Date(leaseStart), new Date(leaseEnd), rentDueDate);
  house.status = 'occupied';
  house.tenant = tenantId;
  house.lastPayment = new Date();
  await property.save();
  res.json({ message: 'House marked as occupied', property });
});