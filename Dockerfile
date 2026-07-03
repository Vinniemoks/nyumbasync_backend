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

# tini for correct PID-1 signal handling (graceful shutdown / zombie reaping);
# su-exec so the entrypoint can drop from root to the app user after preparing
# the mounted volume.
RUN apk add --no-cache tini su-exec

ENV NODE_ENV=production \
    PORT=3001

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Writable runtime directories, owned by the non-root user.
RUN mkdir -p logs uploads reports leases \
    && addgroup -S nyumba && adduser -S nyumba -G nyumba \
    && chown -R nyumba:nyumba /app \
    && chmod +x docker-entrypoint.sh

# No USER directive: the entrypoint starts as root to chown the mounted Fly
# volume (/data), then su-execs to nyumba before running the app.

EXPOSE 3001

# Health check hits the app's own /health endpoint on the configured port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini reaps zombies and forwards SIGTERM to node for graceful shutdown; the
# entrypoint prepares /data and drops privileges to the app user.
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
