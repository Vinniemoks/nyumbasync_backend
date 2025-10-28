const { Config, ConfigVersion } = require('../models/config.model');
const { logAdminActivity } = require('../utils/logger');
const cache = require('memory-cache');

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const configController = {
  // Create or update configuration
  async upsertConfig(req, res) {
    try {
      const { key, value, type, category, description, isPublic } = req.body;

      // Validate value type
      if (!this.validateValueType(value, type)) {
        return res.status(400).json({
          error: 'Value type mismatch'
        });
      }

      // Find existing config
      let config = await Config.findOne({ key });
      
      if (config) {
        // Store previous version
        await ConfigVersion.create({
          configKey: key,
          value: config.value,
          modifiedBy: config.lastModifiedBy,
          version: config.version
        });

        // Update config
        config.value = value;
        config.type = type;
        config.category = category;
        config.description = description;
        config.isPublic = isPublic;
        config.lastModifiedBy = req.user._id;
        config.version += 1;
      } else {
        // Create new config
        config = new Config({
          key,
          value,
          type,
          category,
          description,
          isPublic,
          lastModifiedBy: req.user._id
        });
      }

      await config.save();

      // Clear cache
      cache.del(`config:${key}`);
      cache.del('config:all');

      // Log activity
      await logAdminActivity(req.user._id, 'CONFIG_UPDATED', {
        key,
        newValue: value,
        version: config.version
      });

      res.json({
        message: 'Configuration updated successfully',
        config
      });
    } catch (error) {
      console.error('Config Update Error:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  },

  // Get all configurations
  async getConfigs(req, res) {
    try {
      const { category } = req.query;
      const isAdmin = req.user && ['admin', 'superadmin'].includes(req.user.role);

      // Try cache first
      const cacheKey = 'config:all';
      let configs = cache.get(cacheKey);

      if (!configs) {
        // Build query
        const query = {};
        if (category) query.category = category;
        if (!isAdmin) query.isPublic = true;

        configs = await Config.find(query)
          .select(isAdmin ? '+value' : '-value')
          .populate('lastModifiedBy', 'email role');

        // Cache results
        cache.put(cacheKey, configs, CACHE_DURATION);
      }

      res.json({ configs });
    } catch (error) {
      console.error('Config Retrieval Error:', error);
      res.status(500).json({ error: 'Failed to retrieve configurations' });
    }
  },

  // Get single configuration
  async getConfig(req, res) {
    try {
      const { key } = req.params;
      const isAdmin = req.user && ['admin', 'superadmin'].includes(req.user.role);

      // Try cache first
      const cacheKey = `config:${key}`;
      let config = cache.get(cacheKey);

      if (!config) {
        config = await Config.findOne({ key })
          .select(isAdmin ? '+value' : '-value')
          .populate('lastModifiedBy', 'email role');

        if (!config) {
          return res.status(404).json({ error: 'Configuration not found' });
        }

        // Cache result
        cache.put(cacheKey, config, CACHE_DURATION);
      }

      // Check access
      if (!config.isPublic && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({ config });
    } catch (error) {
      console.error('Config Retrieval Error:', error);
      res.status(500).json({ error: 'Failed to retrieve configuration' });
    }
  },

  // Delete configuration
  async deleteConfig(req, res) {
    try {
      const { key } = req.params;

      const config = await Config.findOne({ key });
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      // Store final version before deletion
      await ConfigVersion.create({
        configKey: key,
        value: config.value,
        modifiedBy: req.user._id,
        version: config.version
      });

      await Config.deleteOne({ key });

      // Clear cache
      cache.del(`config:${key}`);
      cache.del('config:all');

      // Log activity
      await logAdminActivity(req.user._id, 'CONFIG_DELETED', {
        key,
        timestamp: new Date()
      });

      res.json({
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      console.error('Config Deletion Error:', error);
      res.status(500).json({ error: 'Failed to delete configuration' });
    }
  },

  // Get configuration history
  async getConfigHistory(req, res) {
    try {
      const { key } = req.params;
      const { limit = 10 } = req.query;

      const config = await Config.findOne({ key });
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      const history = await ConfigVersion.find({ configKey: key })
        .sort({ version: -1 })
        .limit(parseInt(limit))
        .populate('modifiedBy', 'email role');

      res.json({
        config,
        history
      });
    } catch (error) {
      console.error('Config History Error:', error);
      res.status(500).json({ error: 'Failed to retrieve configuration history' });
    }
  },

  // Restore configuration to previous version
  async restoreConfig(req, res) {
    try {
      const { key } = req.params;
      const { version } = req.body;

      const config = await Config.findOne({ key });
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      const versionToRestore = await ConfigVersion.findOne({
        configKey: key,
        version
      });

      if (!versionToRestore) {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Store current version
      await ConfigVersion.create({
        configKey: key,
        value: config.value,
        modifiedBy: config.lastModifiedBy,
        version: config.version
      });

      // Restore previous version
      config.value = versionToRestore.value;
      config.lastModifiedBy = req.user._id;
      config.version += 1;
      await config.save();

      // Clear cache
      cache.del(`config:${key}`);
      cache.del('config:all');

      // Log activity
      await logAdminActivity(req.user._id, 'CONFIG_RESTORED', {
        key,
        restoredVersion: version,
        newVersion: config.version
      });

      res.json({
        message: 'Configuration restored successfully',
        config
      });
    } catch (error) {
      console.error('Config Restore Error:', error);
      res.status(500).json({ error: 'Failed to restore configuration' });
    }
  },

  // Helper method to validate value type
  validateValueType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'json':
        try {
          JSON.parse(JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }
};

module.exports = configController;