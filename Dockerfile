# ── Dependencies stage ──────────────────────────────────────
# Installs production dependencies only (mongodb-memory-server and other
# devDependencies are excluded, keeping the image lean and dev-test tooling
# out of production).
FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Runtime stage ───────────────────────────────────────────
FROM node:18-alpine AS runtime

WORKDIR /app

# tini for correct PID-1 signal handling (graceful shutdown / zombie reaping).
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=3001

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Writable runtime directories, owned by the non-root user.
RUN mkdir -p logs uploads \
    && addgroup -S nyumba && adduser -S nyumba -G nyumba \
    && chown -R nyumba:nyumba /app

USER nyumba

EXPOSE 3001

# Health check hits the app's own /health endpoint on the configured port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini reaps zombies and forwards SIGTERM to node for graceful shutdown.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]
