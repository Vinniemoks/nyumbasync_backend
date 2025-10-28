const express = require('express');
const router = express.Router();
const searchService = require('../services/search.service');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { validateSearchQuery } = require('../middlewares/validation');

// Apply authentication to all routes
router.use(authMiddleware);

// Search across all document types
router.get('/search', validateSearchQuery, async (req, res) => {
  try {
    const { query, type, from, size, sort, filters } = req.query;

    const results = await searchService.search(type, query, {
      from: parseInt(from) || 0,
      size: parseInt(size) || 100,
      sort: sort ? JSON.parse(sort) : [],
      filters: filters ? JSON.parse(filters) : {}
    });

    res.json(results);
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Search operation failed' });
  }
});

// Index a new document
router.post('/index/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const document = req.body;

    const result = await searchService.indexDocument(type, document);
    res.json(result);
  } catch (error) {
    console.error('Indexing Error:', error);
    res.status(500).json({ error: 'Failed to index document' });
  }
});

// Update indexed document
router.put('/index/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const updates = req.body;

    const result = await searchService.updateDocument(type, id, updates);
    res.json(result);
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete indexed document
router.delete('/index/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    const result = await searchService.deleteDocument(type, id);
    res.json(result);
  } catch (error) {
    console.error('Deletion Error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Bulk index documents
router.post('/bulk-index/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { documents } = req.body;

    const result = await searchService.bulkIndex(type, documents);
    res.json(result);
  } catch (error) {
    console.error('Bulk Indexing Error:', error);
    res.status(500).json({ error: 'Failed to bulk index documents' });
  }
});

module.exports = router;