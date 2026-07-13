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
  const fatal = [];   // missing or known-weak — refuse to boot in production
  const warn = [];    // weaker-than-ideal — surface but don't brick prod

  for (const name of REQUIRED) {
    const val = process.env[name];
    if (!val) {
      if (isProd) {
        fatal.push(`${name} is not set`);
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
      // A known weak literal is always fatal in production. A short-but-custom
      // secret only warns — we must never take prod down over a length rule
      // when the operator has explicitly set a value.
      if (WEAK.has(val)) fatal.push(`${name} uses a known weak value`);
      else if (val.length < MIN_SECRET_LEN) warn.push(`${name} is shorter than the recommended ${MIN_SECRET_LEN} characters`);
    }
  }

  if (warn.length) {
    // eslint-disable-next-line no-console
    console.warn('[secrets] warnings:\n  - ' + warn.join('\n  - '));
  }
  if (fatal.length && isProd) {
    // eslint-disable-next-line no-console
    console.error('FATAL: insecure secret configuration:\n  - ' + fatal.join('\n  - '));
    process.exit(1);
  } else if (fatal.length) {
    // eslint-disable-next-line no-console
    console.warn('[secrets] non-fatal in dev:\n  - ' + fatal.join('\n  - '));
  }
}

module.exports = { validateSecrets };
