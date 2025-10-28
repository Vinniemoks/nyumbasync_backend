const backupManager = require('../utils/backup-manager');

const backupController = {
  // Create a new backup
  async createBackup(req, res) {
    try {
      const backup = await backupManager.createBackup(req.user._id);
      res.json({
        message: 'Backup created successfully',
        backup
      });
    } catch (error) {
      console.error('Backup Creation Error:', error);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  },

  // Restore from backup
  async restoreBackup(req, res) {
    try {
      const { backupId } = req.params;
      const result = await backupManager.restoreBackup(req.user._id, backupId);
      res.json(result);
    } catch (error) {
      console.error('Backup Restore Error:', error);
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  },

  // List available backups
  async listBackups(req, res) {
    try {
      const backups = await backupManager.listBackups();
      res.json({ backups });
    } catch (error) {
      console.error('Backup List Error:', error);
      res.status(500).json({ error: 'Failed to list backups' });
    }
  },

  // Delete a backup
  async deleteBackup(req, res) {
    try {
      const { backupId } = req.params;
      const result = await backupManager.deleteBackup(req.user._id, backupId);
      res.json(result);
    } catch (error) {
      console.error('Backup Delete Error:', error);
      res.status(500).json({ error: 'Failed to delete backup' });
    }
  }
};

module.exports = backupController;