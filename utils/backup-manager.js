const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { logAdminActivity } = require('./logger');
const mongoose = require('mongoose');

class BackupManager {
  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
    this.bucketName = process.env.AWS_BACKUP_BUCKET;
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('Error creating backup directory:', error);
    }
  }

  // Create database backup
  async createBackup(userId) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = uuidv4();
      const filename = `backup-${timestamp}-${backupId}.gz`;
      const filePath = path.join(this.backupDir, filename);

      // Get database connection string
      const dbUrl = mongoose.connection.client.s.url;
      const dbName = mongoose.connection.db.databaseName;

      // Create backup using mongodump
      await new Promise((resolve, reject) => {
        const mongodump = spawn('mongodump', [
          `--uri=${dbUrl}`,
          `--db=${dbName}`,
          '--gzip',
          `--archive=${filePath}`
        ]);

        mongodump.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`mongodump exited with code ${code}`));
        });

        mongodump.on('error', reject);
      });

      // Upload to S3
      const s3Key = `backups/${filename}`;
      await this.uploadToS3(filePath, s3Key);

      // Create backup metadata
      const metadata = {
        backupId,
        filename,
        timestamp: new Date(),
        type: 'full',
        size: (await fs.stat(filePath)).size,
        s3Key
      };

      // Log backup creation
      await logAdminActivity(userId, 'BACKUP_CREATED', metadata);

      // Clean up local file
      await fs.unlink(filePath);

      return metadata;
    } catch (error) {
      console.error('Backup creation failed:', error);
      throw new Error('Failed to create backup');
    }
  }

  // Restore from backup
  async restoreBackup(userId, backupId) {
    try {
      // Get backup metadata
      const backups = await this.listBackups();
      const backup = backups.find(b => b.backupId === backupId);
      
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Download from S3
      const filePath = path.join(this.backupDir, backup.filename);
      await this.downloadFromS3(backup.s3Key, filePath);

      // Get database connection string
      const dbUrl = mongoose.connection.client.s.url;
      const dbName = mongoose.connection.db.databaseName;

      // Restore using mongorestore
      await new Promise((resolve, reject) => {
        const mongorestore = spawn('mongorestore', [
          `--uri=${dbUrl}`,
          `--db=${dbName}`,
          '--gzip',
          `--archive=${filePath}`,
          '--drop'  // Drop existing collections
        ]);

        mongorestore.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`mongorestore exited with code ${code}`));
        });

        mongorestore.on('error', reject);
      });

      // Log restore operation
      await logAdminActivity(userId, 'BACKUP_RESTORED', {
        backupId,
        timestamp: new Date()
      });

      // Clean up local file
      await fs.unlink(filePath);

      return { message: 'Backup restored successfully' };
    } catch (error) {
      console.error('Backup restoration failed:', error);
      throw new Error('Failed to restore backup');
    }
  }

  // List available backups
  async listBackups() {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: 'backups/'
      };

      const response = await this.s3.listObjectsV2(params).promise();
      const backups = response.Contents.map(obj => {
        const filename = path.basename(obj.Key);
        const parts = filename.split('-');
        return {
          backupId: parts[3].replace('.gz', ''),
          filename,
          timestamp: new Date(parts[1] + 'T' + parts[2].replace(/-/g, ':')),
          size: obj.Size,
          s3Key: obj.Key
        };
      });

      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to list backups:', error);
      throw new Error('Failed to list backups');
    }
  }

  // Delete a backup
  async deleteBackup(userId, backupId) {
    try {
      const backups = await this.listBackups();
      const backup = backups.find(b => b.backupId === backupId);

      if (!backup) {
        throw new Error('Backup not found');
      }

      const params = {
        Bucket: this.bucketName,
        Key: backup.s3Key
      };

      await this.s3.deleteObject(params).promise();

      // Log deletion
      await logAdminActivity(userId, 'BACKUP_DELETED', {
        backupId,
        timestamp: new Date()
      });

      return { message: 'Backup deleted successfully' };
    } catch (error) {
      console.error('Failed to delete backup:', error);
      throw new Error('Failed to delete backup');
    }
  }

  // Upload file to S3
  async uploadToS3(filePath, key) {
    const fileContent = await fs.readFile(filePath);
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: fileContent
    };

    await this.s3.upload(params).promise();
  }

  // Download file from S3
  async downloadFromS3(key, filePath) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    const data = await this.s3.getObject(params).promise();
    await fs.writeFile(filePath, data.Body);
  }
}

module.exports = new BackupManager();