#!/bin/bash

# NyumbaSync Backend - Google Cloud Deployment Script
# This script deploys the backend to Google Cloud Run

set -e  # Exit on error

echo "🚀 NyumbaSync Backend - Google Cloud Deployment"
echo "================================================"

# Configuration
PROJECT_ID="nyumbasync-backend"
SERVICE_NAME="nyumbasync-backend"
REGION="us-central1"
DOMAIN="api.mokuavinnie.tech"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo -e "${GREEN}✅ gcloud CLI found${NC}"

# Login check
echo -e "\n${YELLOW}Checking authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}Please login to Google Cloud:${NC}"
    gcloud auth login
fi

# Set project
echo -e "\n${YELLOW}Setting project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "\n${YELLOW}Enabling required APIs...${NC}"
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

echo -e "${GREEN}✅ APIs enabled${NC}"

# Check if secrets exist
echo -e "\n${YELLOW}Checking secrets...${NC}"
REQUIRED_SECRETS=("MONGODB_URI" "JWT_SECRET" "MPESA_CONSUMER_KEY" "MPESA_CONSUMER_SECRET")

for secret in "${REQUIRED_SECRETS[@]}"; do
    if gcloud secrets describe $secret &> /dev/null; then
        echo -e "${GREEN}✅ Secret $secret exists${NC}"
    else
        echo -e "${RED}❌ Secret $secret not found${NC}"
        echo -e "${YELLOW}Create it with: echo -n 'value' | gcloud secrets create $secret --data-file=-${NC}"
        exit 1
    fi
done

# Build and deploy
echo -e "\n${YELLOW}Building and deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,PORT=8080,RP_ID=$DOMAIN" \
  --set-secrets "MONGODB_URI=MONGODB_URI:latest,JWT_SECRET=JWT_SECRET:latest,MPESA_CONSUMER_KEY=MPESA_CONSUMER_KEY:latest,MPESA_CONSUMER_SECRET=MPESA_CONSUMER_SECRET:latest"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")

echo -e "\n${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}Service URL: $SERVICE_URL${NC}"

# Test health endpoint
echo -e "\n${YELLOW}Testing health endpoint...${NC}"
if curl -s "$SERVICE_URL/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Check logs with: gcloud run services logs read $SERVICE_NAME --region $REGION"
fi

# Display next steps
echo -e "\n${GREEN}🎉 Deployment Complete!${NC}"
echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Map custom domain:"
echo "   gcloud run domain-mappings create --service $SERVICE_NAME --domain $DOMAIN --region $REGION"
echo ""
echo "2. View logs:"
echo "   gcloud run services logs tail $SERVICE_NAME --region $REGION"
echo ""
echo "3. Test API:"
echo "   curl $SERVICE_URL/health"
echo ""
echo "4. Update frontend to use: $SERVICE_URL"

echo -e "\n${GREEN}✨ Happy deploying!${NC}"
