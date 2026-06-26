const crypto = require('crypto');

// Characters that are unambiguous when typed on a phone keypad (no 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Generate a short, human-typeable account reference for C2B / bank payments,
// e.g. "NS7K4Q9M". Prefixed so it's recognizable on an M-Pesa statement.
const generateAccountRef = (prefix = 'NS', length = 6) => {
  let ref = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    ref += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${prefix}${ref}`;
};

// Generate an account ref guaranteed unique against existing Payments. Retries
// on the (vanishingly rare) collision; throws if it can't find a free one.
const generateUniqueAccountRef = async (PaymentModel, { prefix = 'NS', length = 6, attempts = 5 } = {}) => {
  for (let i = 0; i < attempts; i++) {
    const ref = generateAccountRef(prefix, length);
    const exists = await PaymentModel.exists({ accountRef: ref });
    if (!exists) return ref;
  }
  throw new Error('Could not generate a unique account reference');
};

module.exports = { generateAccountRef, generateUniqueAccountRef };
