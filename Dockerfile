# Use Node.js 18 LTS Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use npm ci for faster, more reliable installs in production
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs uploads

# Expose port (Cloud Run uses PORT env variable, default to 8080)
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "start"]
