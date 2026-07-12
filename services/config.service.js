const { Config } = require('../models/config.model');

const DEFAULTS = {
  'PLATFORM_RENT_FEE_PERCENT': 5,
  'PLATFORM_VENDOR_FEE_PERCENT': 5
};

/**
 * Get a numeric configuration value. Returns the default if the config
 * entry is missing or cannot be parsed.
 */
const getNumber = async (key, fallback) => {
  const defaultValue = fallback ?? DEFAULTS[key] ?? 0;
  try {
    const config = await Config.findOne({ key });
    if (config && config.value != null) {
      const parsed = Number(config.value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
  } catch (err) {
    // Config collection may not exist in fresh environments.
  }
  return defaultValue;
};

module.exports = { getNumber, DEFAULTS };
