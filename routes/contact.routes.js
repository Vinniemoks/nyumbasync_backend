/**
 * Contact Routes
 */

const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');

// Special routes (must come before :id routes)
router.get('/hot-leads', contactController.getHotLeads);
router.get('/overdue-followups', contactController.getOverdueFollowUps);
router.get('/by-tag/:tag', contactController.getContactsByTag);
router.get('/search', contactController.searchContacts);
router.get('/stats', contactController.getContactStats);
router.get('/tenant-portal-users', contactController.getTenantPortalUsers);

// CRUD routes
router.get('/', contactController.getAllContacts);
router.get('/:id', contactController.getContactById);
router.post('/', contactController.createContact);
router.put('/:id', contactController.updateContact);
router.delete('/:id', contactController.deleteContact);

// Contact-specific actions
router.post('/:id/tags', contactController.addTag);
router.delete('/:id/tags/:tag', contactController.removeTag);
router.post('/:id/interactions', contactController.addInteraction);
router.post('/:id/properties', contactController.linkProperty);
router.put('/:id/buyer-status', contactController.updateBuyerStatus);
router.post('/:id/follow-up', contactController.scheduleFollowUp);
router.post('/:id/enable-portal', contactController.enablePortalAccess);

module.exports = router;
