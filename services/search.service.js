const elasticsearch = require('@elastic/elasticsearch');
const { promisify } = require('util');
const { logActivity } = require('../utils/logger');

class SearchService {
  constructor() {
    this.client = new elasticsearch.Client({
      node: process.env.SEARCH_PROVIDER_URL,
      auth: {
        username: process.env.SEARCH_USERNAME,
        password: process.env.SEARCH_PASSWORD
      }
    });
    this.indexPrefix = process.env.SEARCH_INDEX_PREFIX || 'nyumbasync';
  }

  // Index a document
  async indexDocument(type, document) {
    try {
      const index = `${this.indexPrefix}_${type}`;
      
      const response = await this.client.index({
        index,
        body: {
          ...document,
          indexed_at: new Date(),
          search_metadata: this.generateMetadata(document)
        }
      });

      await logActivity({
        type: 'DOCUMENT_INDEXED',
        details: {
          type,
          documentId: document._id,
          index
        }
      });

      return {
        success: true,
        id: response.body._id,
        index
      };
    } catch (error) {
      console.error('Document Indexing Error:', error);
      throw new Error('Failed to index document');
    }
  }

  // Search across documents
  async search(type, query, options = {}) {
    try {
      const index = `${this.indexPrefix}_${type}`;
      const {
        from = 0,
        size = parseInt(process.env.MAX_SEARCH_RESULTS) || 100,
        sort = [],
        filters = {}
      } = options;

      // Build search query
      const searchQuery = {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['name^2', 'description', 'content', 'tags'],
                fuzziness: 'AUTO'
              }
            }
          ],
          filter: this.buildFilters(filters)
        }
      };

      const response = await this.client.search({
        index,
        body: {
          from,
          size,
          sort,
          query: searchQuery,
          highlight: {
            fields: {
              '*': {}
            }
          }
        }
      });

      return {
        total: response.body.hits.total.value,
        hits: response.body.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          document: hit._source,
          highlights: hit.highlight
        }))
      };
    } catch (error) {
      console.error('Search Error:', error);
      throw new Error('Search operation failed');
    }
  }

  // Update document
  async updateDocument(type, id, updates) {
    try {
      const index = `${this.indexPrefix}_${type}`;
      
      const response = await this.client.update({
        index,
        id,
        body: {
          doc: {
            ...updates,
            updated_at: new Date()
          }
        }
      });

      await logActivity({
        type: 'DOCUMENT_UPDATED',
        details: {
          type,
          documentId: id,
          index
        }
      });

      return {
        success: true,
        version: response.body._version
      };
    } catch (error) {
      console.error('Document Update Error:', error);
      throw new Error('Failed to update document');
    }
  }

  // Delete document
  async deleteDocument(type, id) {
    try {
      const index = `${this.indexPrefix}_${type}`;
      
      await this.client.delete({
        index,
        id
      });

      await logActivity({
        type: 'DOCUMENT_DELETED',
        details: {
          type,
          documentId: id,
          index
        }
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Document Deletion Error:', error);
      throw new Error('Failed to delete document');
    }
  }

  // Bulk index documents
  async bulkIndex(type, documents) {
    try {
      const index = `${this.indexPrefix}_${type}`;
      const operations = documents.flatMap(doc => [
        { index: { _index: index } },
        {
          ...doc,
          indexed_at: new Date(),
          search_metadata: this.generateMetadata(doc)
        }
      ]);

      const { body: bulkResponse } = await this.client.bulk({
        refresh: true,
        body: operations
      });

      if (bulkResponse.errors) {
        const erroredDocuments = [];
        bulkResponse.items.forEach((action, i) => {
          const operation = Object.keys(action)[0];
          if (action[operation].error) {
            erroredDocuments.push({
              status: action[operation].status,
              error: action[operation].error,
              document: documents[i]
            });
          }
        });

        await logActivity({
          type: 'BULK_INDEX_ERRORS',
          details: {
            type,
            errorCount: erroredDocuments.length,
            errors: erroredDocuments
          }
        });
      }

      return {
        success: true,
        indexed: bulkResponse.items.length - (erroredDocuments?.length || 0),
        errors: erroredDocuments || []
      };
    } catch (error) {
      console.error('Bulk Indexing Error:', error);
      throw new Error('Failed to bulk index documents');
    }
  }

  // Helper method to build filters
  buildFilters(filters) {
    const elasticFilters = [];

    Object.entries(filters).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        elasticFilters.push({
          terms: {
            [field]: value
          }
        });
      } else if (typeof value === 'object') {
        if (value.gte || value.lte) {
          elasticFilters.push({
            range: {
              [field]: {
                ...(value.gte && { gte: value.gte }),
                ...(value.lte && { lte: value.lte })
              }
            }
          });
        }
      } else {
        elasticFilters.push({
          term: {
            [field]: value
          }
        });
      }
    });

    return elasticFilters;
  }

  // Helper method to generate metadata
  generateMetadata(document) {
    return {
      word_count: this.countWords(document),
      content_type: this.detectContentType(document),
      language: this.detectLanguage(document)
    };
  }

  // Helper method to count words
  countWords(document) {
    const text = Object.values(document)
      .filter(value => typeof value === 'string')
      .join(' ');
    return text.split(/\s+/).length;
  }

  // Helper method to detect content type
  detectContentType(document) {
    // Implement content type detection logic
    return 'text';
  }

  // Helper method to detect language
  detectLanguage(document) {
    // Implement language detection logic
    return 'en';
  }
}

module.exports = new SearchService();