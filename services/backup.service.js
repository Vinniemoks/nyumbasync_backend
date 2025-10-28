const { S3 } = require('aws-sdk');
const crypto = require('crypto');
const { createGzip } = require('zlib');
const { promisify } = require('util');
const stream = require('stream');
const { logActivity } = require('../utils/logger');

// Initialize S3 client
const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

class BackupService {
  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET;
    this.backupPrefix = 'backups/';
    this.pipeline = promisify(stream.pipeline);
  }

  // Create and upload backup
  async createBackup(data, type) {
    try {
      const timestamp = new Date().toISOString();
      const backupId = crypto.randomBytes(16).toString('hex');
      const filename = `${type}_${timestamp}_${backupId}.json.gz`;
      const key = `${this.backupPrefix}${type}/${filename}`;

      // Create readable stream from data
      const dataStream = new stream.Readable();
      dataStream.push(JSON.stringify(data));
      dataStream.push(null);

      // Create gzip stream
      const gzip = createGzip({
        level: parseInt(process.env.BACKUP_COMPRESSION_LEVEL) || 9
      });

      // Upload to S3
      const upload = s3.upload({
        Bucket: this.bucketName,
        Key: key,
        Body: dataStream.pipe(gzip),
        ContentType: 'application/gzip',
        ServerSideEncryption: process.env.BACKUP_ENCRYPTION_ENABLED === 'true' ? 'AES256' : undefined
      }).promise();

      const result = await upload;

      // Log backup creation
      await logActivity({
        type: 'BACKUP_CREATED',
        details: {
          type,
          filename,
          size: data.length,
          location: result.Location
        }
      });

      // Verify backup if enabled
      if (process.env.BACKUP_VERIFICATION_ENABLED === 'true') {
        await this.verifyBackup(key);
      }

      return {
        success: true,
        backupId,
        location: result.Location,
        timestamp
      };
    } catch (error) {
      console.error('Backup Creation Error:', error);
      throw new Error('Failed to create backup');
    }
  }

  // Restore from backup
  async restoreBackup(backupId) {
    try {
      // Find backup file
      const objects = await s3.listObjects({
        Bucket: this.bucketName,
        Prefix: this.backupPrefix
      }).promise();

      const backup = objects.Contents.find(obj => obj.Key.includes(backupId));
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Download and decompress backup
      const response = await s3.getObject({
        Bucket: this.bucketName,
        Key: backup.Key
      }).promise();

      // Decompress data
      const decompressed = await this.decompressData(response.Body);

      // Parse and validate data
      const data = JSON.parse(decompressed);
      if (!this.validateBackupData(data)) {
        throw new Error('Invalid backup data');
      }

      // Log restoration
      await logActivity({
        type: 'BACKUP_RESTORED',
        details: {
          backupId,
          filename: backup.Key,
          size: response.ContentLength
        }
      });

      return {
        success: true,
        data,
        timestamp: backup.LastModified
      };
    } catch (error) {
      console.error('Backup Restoration Error:', error);
      throw new Error('Failed to restore backup');
    }
  }

  // Verify backup integrity
  async verifyBackup(key) {
    try {
      const response = await s3.getObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();

      // Verify data can be decompressed and parsed
      const decompressed = await this.decompressData(response.Body);
      JSON.parse(decompressed);

      await logActivity({
        type: 'BACKUP_VERIFIED',
        details: {
          key,
          size: response.ContentLength,
          status: 'success'
        }
      });

      return true;
    } catch (error) {
      console.error('Backup Verification Error:', error);
      await logActivity({
        type: 'BACKUP_VERIFICATION_FAILED',
        details: {
          key,
          error: error.message
        }
      });
      throw new Error('Backup verification failed');
    }
  }

  // Clean up old backups
  async cleanupOldBackups() {
    try {
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const objects = await s3.listObjects({
        Bucket: this.bucketName,
        Prefix: this.backupPrefix
      }).promise();

      const oldBackups = objects.Contents.filter(obj => 
        obj.LastModified < cutoffDate
      );

      for (const backup of oldBackups) {
        await s3.deleteObject({
          Bucket: this.bucketName,
          Key: backup.Key
        }).promise();

        await logActivity({
          type: 'BACKUP_DELETED',
          details: {
            key: backup.Key,
            age: Math.floor((Date.now() - backup.LastModified) / (1000 * 60 * 60 * 24))
          }
        });
      }

      return {
        success: true,
        deletedCount: oldBackups.length
      };
    } catch (error) {
      console.error('Backup Cleanup Error:', error);
      throw new Error('Failed to clean up old backups');
    }
  }

  // Helper method to decompress data
  async decompressData(data) {
    return new Promise((resolve, reject) => {
      const gunzip = require('zlib').gunzip;
      gunzip(data, (err, decompressed) => {
        if (err) reject(err);
        else resolve(decompressed.toString());
      });
    });
  }

  // Helper method to validate backup data
  validateBackupData(data) {
    // Add validation logic based on your data structure
    return true;
  }
}

module.exports = new BackupService();