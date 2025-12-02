# Google Cloud Deployment Guide for NyumbaSync Backend

## Overview
This guide will help you deploy the NyumbaSync backend to Google Cloud Platform (GCP) using Google Cloud Run or App Engine.

## 🚀 Deployment Options

### Option 1: Google Cloud Run (Recommended)
- **Best for:** Containerized applications
- **Pros:** Auto-scaling, pay-per-use, easy deployment
- **Cost:** ~$5-20/month for small apps

### Option 2: Google App Engine
- **Best for:** Traditional web apps
- **Pros:** Fully managed, automatic scaling
- **Cost:** ~$10-30/month for small apps

### Option 3: Google Compute Engine (VM)
- **Best for:** Full control
- **Pros:** Complete customization
- **Cost:** ~$20-50/month

---

## 📋 Prerequisites

1. **Google Cloud Account**
   - Sign up at https://cloud.google.com
   - $300 free credit for new users

2. **Google Cloud SDK (gcloud CLI)**
   ```bash
   # Download from: https://cloud.google.com/sdk/docs/install
   # Or use Cloud Shell (built-in)
   ```

3. **Docker** (for Cloud Run)
   ```bash
   # Download from: https://www.docker.com/products/docker-desktop
   ```

4. **Project Setup**
   ```bash
   # Login to Google Cloud
   gcloud auth login
   
   # Create a new project
   gcloud projects create nyumbasync-backend --name="NyumbaSync Backend"
   
   # Set as active project
   gcloud config set project nyumbasync-backend
   
   # Enable required APIs
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

---

## 🐳 Option 1: Deploy to Cloud Run (Recommended)

### Step 1: Create Dockerfile

Create `Dockerfile` in your backend root:

```dockerfile
# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
```

### Step 2: Create .dockerignore

Create `.dockerignore` file:

```
node_modules
npm-debug.log
.env
.env.test
.git
.gitignore
README.md
*.md
logs
test-reports
tests
.vscode
.idx
```

### Step 3: Set Environment Variables

Create secrets in Google Cloud:

```bash
# MongoDB URI
echo -n "your_mongodb_connection_string" | gcloud secrets create MONGODB_URI --data-file=-

# JWT Secret
echo -n "your_jwt_secret_key" | gcloud secrets create JWT_SECRET --data-file=-

# M-Pesa credentials
echo -n "your_mpesa_consumer_key" | gcloud secrets create MPESA_CONSUMER_KEY --data-file=-
echo -n "your_mpesa_consumer_secret" | gcloud secrets create MPESA_CONSUMER_SECRET --data-file=-

# Email credentials
echo -n "your_email_user" | gcloud secrets create EMAIL_USER --data-file=-
echo -n "your_email_password" | gcloud secrets create EMAIL_PASSWORD --data-file=-
```

### Step 4: Deploy to Cloud Run

```bash
# Build and deploy in one command
gcloud run deploy nyumbasync-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,PORT=8080,RP_ID=mokuavinnie.tech" \
  --set-secrets "MONGODB_URI=MONGODB_URI:latest,JWT_SECRET=JWT_SECRET:latest,MPESA_CONSUMER_KEY=MPESA_CONSUMER_KEY:latest,MPESA_CONSUMER_SECRET=MPESA_CONSUMER_SECRET:latest,EMAIL_USER=EMAIL_USER:latest,EMAIL_PASSWORD=EMAIL_PASSWORD:latest"

# Or build separately
gcloud builds submit --tag gcr.io/nyumbasync-backend/nyumbasync-api

# Then deploy
gcloud run deploy nyumbasync-backend \
  --image gcr.io/nyumbasync-backend/nyumbasync-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Step 5: Map Custom Domain

```bash
# Map your domain
gcloud run domain-mappings create \
  --service nyumbasync-backend \
  --domain api.mokuavinnie.tech \
  --region us-central1

# Get the DNS records to add
gcloud run domain-mappings describe \
  --domain api.mokuavinnie.tech \
  --region us-central1
```

Add the DNS records to your domain registrar:
- Type: A
- Name: api
- Value: (provided by Google Cloud)

---

## 🌐 Option 2: Deploy to App Engine

### Step 1: Create app.yaml

Create `app.yaml` in your backend root:

```yaml
runtime: nodejs18

instance_class: F1

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.65

env_variables:
  NODE_ENV: "production"
  PORT: "8080"
  RP_ID: "mokuavinnie.tech"

# Environment variables from Secret Manager
env_variables:
  MONGODB_URI: ${MONGODB_URI}
  JWT_SECRET: ${JWT_SECRET}
  MPESA_CONSUMER_KEY: ${MPESA_CONSUMER_KEY}
  MPESA_CONSUMER_SECRET: ${MPESA_CONSUMER_SECRET}
  EMAIL_USER: ${EMAIL_USER}
  EMAIL_PASSWORD: ${EMAIL_PASSWORD}
```

### Step 2: Deploy

```bash
# Deploy to App Engine
gcloud app deploy

# View logs
gcloud app logs tail -s default

# Open in browser
gcloud app browse
```

### Step 3: Map Custom Domain

```bash
# Add custom domain
gcloud app domain-mappings create api.mokuavinnie.tech

# Get DNS records
gcloud app domain-mappings describe api.mokuavinnie.tech
```

---

## 💻 Option 3: Deploy to Compute Engine (VM)

### Step 1: Create VM Instance

```bash
# Create Ubuntu VM
gcloud compute instances create nyumbasync-backend \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2004-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --tags=http-server,https-server

# Allow HTTP/HTTPS traffic
gcloud compute firewall-rules create allow-http \
  --allow tcp:80,tcp:443 \
  --target-tags http-server,https-server
```

### Step 2: SSH into VM

```bash
# SSH into the instance
gcloud compute ssh nyumbasync-backend --zone=us-central1-a
```

### Step 3: Setup on VM

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Clone your repository
git clone https://github.com/Vinniemoks/nyumbasync_backend.git
cd nyumbasync_backend

# Install dependencies
npm install

# Create .env file
nano .env
# Add your environment variables

# Start with PM2
pm2 start server.js --name nyumbasync-backend
pm2 startup
pm2 save

# Install Nginx
sudo apt install -y nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/nyumbasync
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name api.mokuavinnie.tech;

    location / {
        proxy_pass http://localhost:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/nyumbasync /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.mokuavinnie.tech
```

---

## 🔐 Environment Variables Setup

### Required Environment Variables

```env
# Server
NODE_ENV=production
PORT=8080

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nyumbasync

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=1h

# M-Pesa
MPESA_CONSUMER_KEY=your_mpesa_consumer_key
MPESA_CONSUMER_SECRET=your_mpesa_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://api.mokuavinnie.tech/api/v1/mpesa/callback

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Biometric
RP_ID=mokuavinnie.tech

# CORS
CORS_ORIGIN=https://mokuavinnie.tech

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

---

## 📊 MongoDB Atlas Setup

1. **Create MongoDB Atlas Account**
   - Go to https://www.mongodb.com/cloud/atlas
   - Create free cluster

2. **Configure Network Access**
   - Add IP: `0.0.0.0/0` (allow from anywhere)
   - Or add specific Google Cloud IPs

3. **Create Database User**
   - Username: `nyumbasync`
   - Password: (generate strong password)

4. **Get Connection String**
   ```
   mongodb+srv://nyumbasync:<password>@cluster0.xxxxx.mongodb.net/nyumbasync?retryWrites=true&w=majority
   ```

---

## 🔍 Monitoring & Logging

### Cloud Run Logs

```bash
# View logs
gcloud run services logs read nyumbasync-backend \
  --region us-central1 \
  --limit 50

# Stream logs
gcloud run services logs tail nyumbasync-backend \
  --region us-central1
```

### Set Up Monitoring

```bash
# Enable Cloud Monitoring
gcloud services enable monitoring.googleapis.com

# Create uptime check
gcloud monitoring uptime-checks create https://api.mokuavinnie.tech/health
```

---

## 🧪 Testing Deployment

### Health Check

```bash
# Test health endpoint
curl https://api.mokuavinnie.tech/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-20T...",
  "uptime": 12345
}
```

### Test API Endpoints

```bash
# Test biometric login challenge
curl -X POST https://api.mokuavinnie.tech/api/v1/biometric/login/challenge \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@example.com"}'

# Test landlord analytics (requires auth)
curl https://api.mokuavinnie.tech/landlord/analytics/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 💰 Cost Estimation

### Cloud Run (Recommended)
- **Free Tier:** 2 million requests/month
- **After Free Tier:** ~$0.40 per million requests
- **Estimated:** $5-20/month for small app

### App Engine
- **Free Tier:** 28 instance hours/day
- **After Free Tier:** ~$0.05/hour
- **Estimated:** $10-30/month

### Compute Engine
- **e2-micro:** ~$7/month (always free eligible)
- **e2-small:** ~$14/month
- **Estimated:** $20-50/month with bandwidth

---

## 🔄 CI/CD Setup (Optional)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches: [ master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Cloud SDK
      uses: google-github-actions/setup-gcloud@v0
      with:
        project_id: ${{ secrets.GCP_PROJECT_ID }}
        service_account_key: ${{ secrets.GCP_SA_KEY }}
    
    - name: Build and Deploy
      run: |
        gcloud run deploy nyumbasync-backend \
          --source . \
          --platform managed \
          --region us-central1 \
          --allow-unauthenticated
```

---

## 🐛 Troubleshooting

### Issue: "Service Unavailable"
```bash
# Check logs
gcloud run services logs read nyumbasync-backend --region us-central1

# Check service status
gcloud run services describe nyumbasync-backend --region us-central1
```

### Issue: "Cannot connect to MongoDB"
- Check MongoDB Atlas network access
- Verify connection string
- Check if IP is whitelisted

### Issue: "Environment variables not set"
```bash
# List current env vars
gcloud run services describe nyumbasync-backend \
  --region us-central1 \
  --format="value(spec.template.spec.containers[0].env)"

# Update env vars
gcloud run services update nyumbasync-backend \
  --region us-central1 \
  --set-env-vars "KEY=VALUE"
```

---

## 📝 Quick Deployment Checklist

- [ ] Google Cloud account created
- [ ] Project created and configured
- [ ] MongoDB Atlas cluster created
- [ ] Environment variables set in Secret Manager
- [ ] Dockerfile created
- [ ] Code pushed to GitHub
- [ ] Deployed to Cloud Run/App Engine
- [ ] Custom domain mapped
- [ ] SSL certificate configured
- [ ] Health check passing
- [ ] API endpoints tested
- [ ] Monitoring enabled
- [ ] Logs accessible

---

## 🎉 Success!

Your NyumbaSync backend is now deployed to Google Cloud!

**Your API is available at:**
- https://api.mokuavinnie.tech
- https://nyumbasync-backend-xxxxx-uc.a.run.app (Cloud Run URL)

**Next Steps:**
1. Update frontend to use new API URL
2. Test all endpoints
3. Monitor logs and performance
4. Set up alerts for errors
5. Configure backups

---

**Need Help?**
- Google Cloud Documentation: https://cloud.google.com/docs
- Cloud Run Docs: https://cloud.google.com/run/docs
- Support: support@nyumbasync.com

**Last Updated:** November 20, 2025
