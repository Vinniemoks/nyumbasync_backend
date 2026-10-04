// Token scope + account-state helpers shared by every place that accepts a
// bearer token (HTTP middleware, optional auth, websocket handshake).
//
// Why this exists: the login flow hands out short-lived *step* tokens before
// a login is complete — a password-change token, a new-IP session token and an
// MFA session token. They are signed with the same secret and carry `userId`,
// so any verifier that only checked the signature treated them as full access
// tokens, which let someone with just a correct password skip the new-IP check
// (and MFA, and the forced password change). Step tokens carry a `purpose`
// claim and refresh tokens carry `type`; neither may be used as an access token.

const PURPOSES = Object.freeze({
  PASSWORD_CHANGE: 'password-change',
  IP_VERIFICATION: 'ip-verification',
  MFA_STEP_UP: 'mfa-step-up',
});

/** The scope claim of a decoded token, or null for a plain access token. */
const scopeOf = (decoded) => (decoded && (decoded.purpose || decoded.type)) || null;

/** True when a decoded token is a plain access token (no step/refresh scope). */
const isAccessToken = (decoded) => scopeOf(decoded) === null;

/**
 * Why an account may not sign in / use the API, or null if it can.
 * `isActive:false` and `status` of inactive/suspended both lock an account;
 * a missing status means active (older accounts).
 */
const accountBlockReason = (user) => {
  if (!user) return 'not_found';
  // Status first: suspending also clears isActive, and must not read as "inactive".
  if (user.status === 'suspended') return 'suspended';
  if (user.status === 'inactive' || user.isActive === false) return 'inactive';
  return null;
};

const BLOCK_MESSAGES = {
  suspended: 'This account has been suspended. Please contact support.',
  inactive: 'This account is inactive. Please contact support.',
};

module.exports = { PURPOSES, scopeOf, isAccessToken, accountBlockReason, BLOCK_MESSAGES };
