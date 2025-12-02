# 🚀 Deploy to Google Cloud NOW - Quick Start

## ⚡ Fastest Way to Deploy (5 minutes)

### Prerequisites
1. Google Cloud account (get $300 free credit)
2. gcloud CLI installed

### Step 1: Install gcloud CLI (if not installed)

**Windows:**
```powershell
# Download and run installer
# https://cloud.google.com/sdk/docs/install
```

**Or use Google Cloud Shell** (no installation needed):
- Go to https://console.cloud.google.com
- Click the Cloud Shell icon (top right)
- Your terminal is ready!

### Step 2: Login and Setup

```bash
# Login to Google Cloud
gcloud auth login

# Create project
gcloud projects create nyumbasync-backend --name="NyumbaSync Backend"

# Set active project
gcloud config set project nyumbasync-backend

# Enable billing (required)
# Go to: https://console.cloud.google.com/billing
# Link your project to billing account
```

### Step 3: Create Secrets

```bash
# MongoDB URI (get from MongoDB Atlas)
echo -n "mongodb+srv://username:password@cluster.mongodb.net/nyumbasync" | \
  gcloud secrets create MONGODB_URI --data-file=-

# JWT Secret (generate random string)
echo -n "$(openssl rand -base64 32)" | \
  gcloud secrets create JWT_SECRET --data-file=-

# M-Pesa credentials
echo -n "your_mpesa_consumer_key" | \
  gcloud secrets create MPESA_CONSUMER_KEY --data-file=-

echo -n "your_mpesa_consumer_secret" | \
  gcloud secrets create MPESA_CONSUMER_SECRET --data-file=-
```

### Step 4: Deploy!

**Option A: Use the automated script**
```bash
# Make script executable
chmod +x deploy-to-gcloud.sh

# Run deployment
./deploy-to-gcloud.sh
```

**Option B: Manual deployment**
```bash
# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Deploy to Cloud Run
gcloud run deploy nyumbasync-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --set-env-vars "NODE_ENV=production,PORT=8080,RP_ID=mokuavinnie.tech" \
  --set-secrets "MONGODB_URI=MONGODB_URI:latest,JWT_SECRET=JWT_SECRET:latest,MPESA_CONSUMER_KEY=MPESA_CONSUMER_KEY:latest,MPESA_CONSUMER_SECRET=MPESA_CONSUMER_SECRET:latest"
```

### Step 5: Get Your URL

```bash
# Get service URL
gcloud run services describe nyumbasync-backend \
  --region us-central1 \
  --format="value(status.url)"

# Example output: https://nyumbasync-backend-xxxxx-uc.a.run.app
```

### Step 6: Test It!

```bash
# Test health endpoint
curl https://nyumbasync-backend-xxxxx-uc.a.run.app/health

# Should return:
# {"status":"ok","timestamp":"..."}
```

### Step 7: Map Custom Domain (Optional)

```bash
# Map your domain
gcloud run domain-mappings create \
  --service nyumbasync-backend \
  --domain api.mokuavinnie.tech \
  --region us-central1

# Get DNS records
gcloud run domain-mappings describe \
  --domain api.mokuavinnie.tech \
  --region us-central1
```

Add the DNS records to your domain registrar (Namecheap, GoDaddy, etc.)

---

## 🎉 Done!

Your backend is now live at:
- **Cloud Run URL:** https://nyumbasync-backend-xxxxx-uc.a.run.app
- **Custom Domain:** https://api.mokuavinnie.tech (after DNS propagation)

---

## 📊 View Logs

```bash
# Stream logs
gcloud run services logs tail nyumbasync-backend --region us-central1

# View recent logs
gcloud run services logs read nyumbasync-backend --region us-central1 --limit 50
```

---

## 🔄 Update Deployment

```bash
# After making code changes
git add .
git commit -m "Update backend"
git push origin master

# Redeploy
gcloud run deploy nyumbasync-backend \
  --source . \
  --region us-central1
```

---

## 💰 Cost

**Free Tier:**
- 2 million requests/month
- 360,000 GB-seconds/month
- 180,000 vCPU-seconds/month

**After Free Tier:**
- ~$0.40 per million requests
- **Estimated:** $5-20/month for small app

---

## 🐛 Troubleshooting

### "Permission denied"
```bash
# Grant yourself permissions
gcloud projects add-iam-policy-binding nyumbasync-backend \
  --member="user:your-email@gmail.com" \
  --role="roles/owner"
```

### "Billing not enabled"
- Go to https://console.cloud.google.com/billing
- Enable billing for your project

### "Service unavailable"
```bash
# Check logs
gcloud run services logs read nyumbasync-backend --region us-central1

# Check service status
gcloud run services describe nyumbasync-backend --region us-central1
```

### "Cannot connect to MongoDB"
- Check MongoDB Atlas network access
- Add `0.0.0.0/0` to IP whitelist
- Verify connection string

---

## 📚 Full Documentation

For detailed information, see:
- `GOOGLE_CLOUD_DEPLOYMENT.md` - Complete deployment guide
- `BIOMETRIC_LOGIN_GUIDE.md` - Fingerprint scanner setup
- `LANDLORD_README.md` - Landlord portal features

---

## ✅ Deployment Checklist

- [ ] Google Cloud account created
- [ ] gcloud CLI installed (or using Cloud Shell)
- [ ] Project created
- [ ] Billing enabled
- [ ] MongoDB Atlas cluster created
- [ ] Secrets created in Secret Manager
- [ ] Deployed to Cloud Run
- [ ] Health check passing
- [ ] Custom domain mapped (optional)
- [ ] Frontend updated with new API URL

---

## 🎊 Success!

Your NyumbaSync backend is now running on Google Cloud!

**What's deployed:**
- ✅ Landlord Portal (22 endpoints)
- ✅ Biometric Authentication (USB fingerprint scanner)
- ✅ Email Templates (19 templates)
- ✅ Workflow Automation
- ✅ Vendor Management
- ✅ Financial Dashboard
- ✅ CRM Features
- ✅ Document Management

**Next Steps:**
1. Update your frontend to use the new API URL
2. Test all endpoints
3. Set up monitoring alerts
4. Configure backups

---

**Need Help?**
- Google Cloud Console: https://console.cloud.google.com
- Documentation: `GOOGLE_CLOUD_DEPLOYMENT.md`
- Support: support@nyumbasync.com

**Happy Deploying! 🚀**
