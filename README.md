# NyumbaSync Backend

Node.js + Express API for NyumbaSync. Serves web, desktop, and mobile clients.

## Quick start

```bash
npm install
cp .env.example .env   # fill in secrets
npm run dev            # http://localhost:3001
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development with auto-reload (nodemon) |
| `npm start` | Production mode |
| `npm test` | Run all Jest tests |
| `npm run test:auth` | Auth tests only |
| `npm run test:security` | Security tests (Mocha) |

## Project structure

```
controllers/    # Business logic
models/         # Mongoose schemas
routes/v1/      # API route definitions
middlewares/    # Auth, security, upload, etc.
config/         # Environment + security config
utils/          # Helpers, load balancer, worker health
services/       # Email, SMS, M-Pesa
views/emails/   # Handlebars email templates
tests/          # Jest + Mocha test suites
logs/           # Winston logs (auto-created)
```

## API docs

See [docs/API.md](../docs/API.md) for the full endpoint reference.

## Environment variables

Key variables in `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | 32+ char random string for signing tokens |
| `JWT_REFRESH_SECRET` | Yes | Separate secret for refresh tokens |
| `PORT` | No | Defaults to 3001 |
| `NODE_ENV` | No | `development` / `production` |
| `CORS_ORIGINS` | Production | Comma-separated allowed origins |
| `SENDGRID_API_KEY` | No | Email via SendGrid (falls back to SMTP) |
| `MPESA_*` | No | M-Pesa Daraja credentials |
| `PAYSTACK_*` | No | Card payment credentials |
| `TWILIO_*` | No | SMS/WhatsApp credentials |

Generate JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Testing

```bash
# Health check
curl http://localhost:3001/health

# Signup
curl -X POST http://localhost:3001/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","firstName":"Test","lastName":"User","phone":"254712345678","role":"tenant"}'

# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'
```

## Architecture & Security

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) and [docs/SECURITY.md](../docs/SECURITY.md).
