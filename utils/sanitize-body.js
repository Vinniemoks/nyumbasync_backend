// Strip server-controlled / sensitive fields from a client-supplied request
// body before passing it to a model create/update. Prevents mass-assignment
// (assessment C6): Mongoose already drops fields absent from the schema, but a
// client could still set sensitive *schema* fields (status, ownership, ratings,
// receipts). Callers pass the sensitive keys for that entity.
const ALWAYS_STRIP = ['_id', '__v', 'createdAt', 'updatedAt'];

function sanitizeBody(body, protectedKeys = []) {
  const out = { ...(body || {}) };
  for (const key of [...ALWAYS_STRIP, ...protectedKeys]) {
    delete out[key];
  }
  return out;
}

module.exports = { sanitizeBody };
