# 🚀 NyumbaSync Backend Deployment Guide

**Version**: 1.0.0  
**Date**: November 19, 2025  
**Status**: Production Ready (85%)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Local Development](#local-development)
5. [Testing](#testing)
6. [Staging Deployment](#staging-deployment)
7. [Production Deployment](#production-deployment)
8. [Infrastructure Setup](#infrastructure-setup)
9. [Security Configuration](#security-configuration)
10. [Monitoring & Logging](#monitoring--logging)
11. [Backup & Recovery](#backup--recovery)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The NyumbaSync backend is a Node.js/Express API with MongoDB database, designed for property management in Kenya.

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   Node.js API   │────│    MongoDB      │
│   (Nginx/ALB)   │    │   (Express)     │    │   (Atlas/Self)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │     Redis       │              │
         │              │  (Token Cache)  │              │
         │              └─────────────────┘              │
         │                                               │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File Storage  │    │   Monitoring    │    │   External APIs │
│   (AWS S3/GCS)  │    │ (Sentry/DataDog)│    │ (M-Pesa/Twilio)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Prerequisites

### System Requirements

#### Development
- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **MongoDB**: 6.x or higher (local or Atlas)
- **Redis**: 7.x or higher (optional, for token blacklisting)
- **Git**: Latest version

#### Production
- **Server**: Ubuntu 20.04+ / CentOS 8+ / Amazon Linux 2
- **RAM**: Minimum 2GB, Recommended 4GB+
- **CPU**: Minimum 2 cores, Recommended 4+ cores
- **Storage**: Minimum 20GB SSD
- **Network**: Static IP, Domain name

### Required Accounts

1. **MongoDB Atlas** (or self-hosted MongoDB)
2. **Redis Cloud** (or self-hosted Redis)
3. **AWS/GCP/Azure** (for hosting)
4. **Domain Registrar** (for SSL/DNS)
5. **M-Pesa Developer Account**
6. **Twilio Account** (for SMS)
7. **Email Service** (SendGrid/Mailgun)
8. **Monitoring Service** (Sentry/DataDog)

---

## Environment Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-org/nyumbasync-backend.git
cd nyumbasync-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Environment Variables

#### Development (.env.development)

```bash
# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development
PORT=3001

# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb://localhost:27017/nyumbasync_dev

# ============================================
# JWT AUTHENTICATION
# ============================================
JWT_SECRET=your-development-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# ============================================
# REDIS (Optional)
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# SECURITY
# ============================================
ENCRYPTION_KEY=your-encryption-key-32-chars

# ============================================
# M-PESA INTEGRATION
# ============================================
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your-mpesa-consumer-key
MPESA_CONSUMER_SECRET=your-mpesa-consumer-secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your-mpesa-passkey
MPESA_CALLBACK_URL=http://localhost:3001/api/v1/mpesa/callback

# ============================================
# TWILIO SMS
# ============================================
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# ============================================
# EMAIL SERVICE
# ============================================
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# ============================================
# FILE UPLOAD
# ============================================
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=debug
LOG_FILE=logs/app.log
```

### 3. Generate Secrets

```bash
# Generate JWT secrets
openssl rand -base64 32  # JWT_SECRET
openssl rand -base64 32  # JWT_REFRESH_SECRET

# Generate encryption key
openssl rand -hex 32     # ENCRYPTION_KEY
```

---

## Local Development

### 1. Setup Local Services

#### MongoDB (Docker)

```bash
# Run MongoDB in Docker
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -v mongodb_data:/data/db \
  mongo:6
```

#### Redis (Docker)

```bash
# Run Redis in Docker
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 2. Start Development Server

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start with nodemon
npm run start:dev
```

### 3. Verify Installation

```bash
# Check health endpoint
curl http://localhost:3001/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "19/11/2025, 06:00:00 pm",
  "uptime": 10.5,
  "database": "connected"
}
```

---

## Testing

### Run Test Suite

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:auth
npm run test:property
npm run test:maintenance
npm run test:security

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run performance tests
node tests/performance/simple-perf-test.js
```

### Test Coverage

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

---

## Staging Deployment

### 1. Server Setup (Ubuntu 20.04)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y

# Create application user
sudo useradd -m -s /bin/bash nyumbasync
```

### 2. Application Deployment

```bash
# Switch to application user
sudo su - nyumbasync

# Clone repository
git clone https://github.com/your-org/nyumbasync-backend.git
cd nyumbasync-backend

# Install dependencies
npm ci --production

# Copy staging environment
cp .env.example .env

# Edit environment variables
nano .env

# Create necessary directories
mkdir -p logs uploads
chmod 755 logs uploads
```

### 3. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'nyumbasync-staging',
    script: './server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'staging',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G'
  }]
};
```

```bash
# Start application with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup
```

### 4. Nginx Configuration

Create `/etc/nginx/sites-available/nyumbasync`:

```nginx
server {
    listen 80;
    server_name api.nyumbasync.co.ke;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # File upload size
    client_max_body_size 10M;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/nyumbasync /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 5. SSL Certificate

```bash
# Obtain SSL certificate
sudo certbot --nginx -d api.nyumbasync.co.ke

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Production Deployment

### 1. Infrastructure Options

#### Option A: AWS EC2

```bash
# Launch EC2 instance
# - Instance type: t3.medium or larger
# - AMI: Ubuntu 20.04 LTS
# - Security groups: SSH (22), HTTP (80), HTTPS (443)
# - Storage: 20GB+ SSD

# Connect to instance
ssh -i your-key.pem ubuntu@your-ec2-ip
```

#### Option B: DigitalOcean Droplet

```bash
# Create droplet
# - Size: 2GB RAM, 2 vCPUs
# - Image: Ubuntu 20.04
# - Add SSH key

# Connect to droplet
ssh root@your-droplet-ip
```

### 2. Production Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install production tools
sudo npm install -g pm2
sudo apt install nginx certbot python3-certbot-nginx fail2ban -y

# Create application user
sudo useradd -m -s /bin/bash nyumbasync
sudo mkdir -p /var/www/nyumbasync
sudo chown nyumbasync:nyumbasync /var/www/nyumbasync
```

### 3. Production PM2 Configuration

Create `ecosystem.production.js`:

```javascript
module.exports = {
  apps: [{
    name: 'nyumbasync-api',
    script: './server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '2G',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

---

## Infrastructure Setup

### MongoDB Atlas Setup

1. **Create Cluster**
   - Go to https://cloud.mongodb.com
   - Create new cluster (M10+ for production)
   - Choose region closest to your users (e.g., Frankfurt for Kenya)

2. **Configure Security**
   ```bash
   # Add IP whitelist
   # - Development: Your IP
   # - Production: Server IP or 0.0.0.0/0 (with strong auth)
   
   # Create database user
   # Username: nyumbasync_prod
   # Password: <strong-password>
   # Role: readWrite on nyumbasync database
   ```

3. **Get Connection String**
   ```
   mongodb+srv://username:password@cluster.mongodb.net/nyumbasync?retryWrites=true&w=majority
   ```

### Redis Cloud Setup

1. **Create Database**
   - Go to https://redis.com/try-free
   - Create new database
   - Choose region matching your server

2. **Get Connection String**
   ```
   redis://default:password@redis-endpoint:port
   ```

### AWS S3 Setup (File Storage)

```bash
# Create S3 bucket
aws s3 mb s3://nyumbasync-uploads --region us-east-1

# Set bucket policy
aws s3api put-bucket-policy --bucket nyumbasync-uploads --policy file://bucket-policy.json

# Create IAM user with S3 access
aws iam create-user --user-name nyumbasync-s3
aws iam attach-user-policy --user-name nyumbasync-s3 --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create access keys
aws iam create-access-key --user-name nyumbasync-s3
```

---

## Security Configuration

### 1. Firewall Setup

```bash
# Configure UFW firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check status
sudo ufw status
```

### 2. Fail2Ban Configuration

Create `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
```

```bash
# Restart fail2ban
sudo systemctl restart fail2ban
```

### 3. SSL/TLS Configuration

```bash
# Obtain certificate
sudo certbot --nginx -d api.nyumbasync.co.ke

# Auto-renewal cron job
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

---

## Monitoring & Logging

### 1. PM2 Monitoring

```bash
# Monitor processes
pm2 monit

# View logs
pm2 logs

# View specific app logs
pm2 logs nyumbasync-api

# Flush logs
pm2 flush
```

### 2. Sentry Integration

```javascript
// Add to server.js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

### 3. Log Rotation

Create `/etc/logrotate.d/nyumbasync`:

```
/var/www/nyumbasync/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nyumbasync nyumbasync
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## Backup & Recovery

### 1. MongoDB Backup

```bash
# Manual backup
mongodump --uri="mongodb+srv://username:password@cluster.mongodb.net/nyumbasync" --out=/backup/$(date +%Y%m%d)

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +
```

### 2. Application Backup

```bash
# Backup application files
tar -czf /backup/app-$(date +%Y%m%d).tar.gz /var/www/nyumbasync

# Backup environment
cp /var/www/nyumbasync/.env /backup/env-$(date +%Y%m%d).env
```

### 3. Automated Backup Cron

```bash
# Add to crontab
0 2 * * * /usr/local/bin/backup-mongodb.sh
0 3 * * 0 /usr/local/bin/backup-app.sh
```

---

## Troubleshooting

### Common Issues

#### 1. Application Won't Start

```bash
# Check PM2 logs
pm2 logs nyumbasync-api --lines 100

# Check environment variables
pm2 env 0

# Restart application
pm2 restart nyumbasync-api
```

#### 2. Database Connection Issues

```bash
# Test MongoDB connection
mongosh "mongodb+srv://cluster.mongodb.net" --username user

# Check network connectivity
ping cluster.mongodb.net

# Verify IP whitelist in MongoDB Atlas
```

#### 3. High Memory Usage

```bash
# Check memory usage
pm2 monit

# Restart with memory limit
pm2 restart nyumbasync-api --max-memory-restart 2G

# Check for memory leaks
node --inspect server.js
```

#### 4. SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew --force-renewal

# Test SSL configuration
openssl s_client -connect api.nyumbasync.co.ke:443
```

### Performance Issues

```bash
# Check server resources
htop
df -h
free -m

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check application logs
pm2 logs --lines 100

# Monitor network
netstat -tulpn | grep :3001
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Security audit completed
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] SSL certificates obtained
- [ ] DNS records configured

### Deployment

- [ ] Server provisioned
- [ ] Dependencies installed
- [ ] Application deployed
- [ ] PM2 configured
- [ ] Nginx configured
- [ ] Firewall configured
- [ ] SSL enabled
- [ ] Health checks passing

### Post-Deployment

- [ ] Smoke tests completed
- [ ] Monitoring active
- [ ] Logs being collected
- [ ] Backups running
- [ ] Performance baseline established
- [ ] Documentation updated
- [ ] Team notified

---

## Quick Commands Reference

```bash
# Application Management
pm2 start ecosystem.config.js
pm2 restart nyumbasync-api
pm2 stop nyumbasync-api
pm2 delete nyumbasync-api
pm2 logs nyumbasync-api
pm2 monit

# Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx

# SSL
sudo certbot renew
sudo certbot certificates

# Logs
tail -f logs/app.log
pm2 logs --lines 100
sudo tail -f /var/log/nginx/error.log

# System
htop
df -h
free -m
netstat -tulpn
```

---

## Support & Resources

- **Documentation**: See START_HERE.md
- **API Reference**: See BACKEND_API_REFERENCE.md
- **Security**: See SECURITY_COMPLETE.md
- **Testing**: See RUN_TESTS.md

---

**Last Updated**: November 19, 2025  
**Maintained By**: NyumbaSync Development Team
