/**
 * Transaction Routes V2
 * Enhanced routes for core transaction model
 */

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction-v2.controller');

// Special routes (must come before :id routes)
router.get('/by-stage/:stage', transactionController.getTransactionsByStage);
router.get('/by-contact/:contactId', transactionController.getTransactionsByContact);
router.get('/by-verification-code/:code', transactionController.getLeaseByVerificationCode);
router.get('/pipeline/active', transactionController.getActivePipeline);
router.get('/overdue', transactionController.getOverdueTransactions);
router.get('/stats/pipeline', transactionController.getPipelineStats);

// CRUD routes
router.get('/', transactionController.getAllTransactions);
router.get('/:id', transactionController.getTransactionById);
router.post('/', transactionController.createTransaction);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

// Transaction-specific actions
router.put('/:id/stage', transactionController.moveToStage);
router.post('/:id/milestones', transactionController.addMilestone);
router.put('/:id/milestones/:milestoneName/complete', transactionController.completeMilestone);
router.post('/:id/tasks', transactionController.addTask);
router.put('/:id/tasks/:taskId/complete', transactionController.completeTask);
router.post('/:id/documents', transactionController.addDocument);
router.post('/:id/notes', transactionController.addNote);
router.post('/:id/contacts', transactionController.addContact);

// Tenant portal integration
router.post('/:id/generate-verification-code', transactionController.generateVerificationCode);
router.post('/:id/send-tenant-invitation', transactionController.sendTenantInvitation);

module.exports = router;
