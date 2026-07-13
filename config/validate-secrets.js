// Fail-closed secret validation. Runs once at startup.
//
// Weak/missing secret fallbacks turn environment drift into a runtime
// vulnerability (forgeable tokens/sessions). In production we refuse to boot
// unless the required secrets are present and strong; in dev we warn and
// generate an ephemeral per-boot secret so nothing ships a known key.
// Addresses assessment findings C15, C18, H3.

const crypto = require('crypto');

const REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET', 'MONGODB_URI'];
const MIN_SECRET_LEN = 32;
const WEAK = new Set([
  '12345678',
  'nyumbasync-session-secret',
  'secret',
  'changeme',
  'your_random_jwt_secret_key',
]);

function validateSecrets() {
  const isProd = process.env.NODE_ENV === 'production';
  const problems = [];

  for (const name of REQUIRED) {
    const val = process.env[name];
    if (!val) {
      if (isProd) {
        problems.push(`${name} is not set`);
      } else if (name !== 'MONGODB_URI') {
        // Dev convenience: generate an ephemeral secret so nothing uses a known
        // literal. Tokens signed this boot won't survive a restart — fine for dev.
        process.env[name] = crypto.randomBytes(32).toString('hex');
        // eslint-disable-next-line no-console
        console.warn(`[secrets] ${name} unset — using an ephemeral dev secret.`);
      }
      continue;
    }
    if (name.endsWith('SECRET')) {
      if (WEAK.has(val)) problems.push(`${name} uses a known weak value`);
      else if (val.length < MIN_SECRET_LEN) problems.push(`${name} must be at least ${MIN_SECRET_LEN} characters`);
    }
  }

  if (problems.length && isProd) {
    // eslint-disable-next-line no-console
    console.error('FATAL: insecure secret configuration:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  } else if (problems.length) {
    // eslint-disable-next-line no-console
    console.warn('[secrets] warnings (non-fatal in dev):\n  - ' + problems.join('\n  - '));
  }
}

module.exports = { validateSecrets };
