/**
 * Formats Kenyan phone numbers to 2547XXXXXXXX
 */
exports.formatKenyanPhone = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle common formats:
  if (cleaned.startsWith('07')) return `254${cleaned.slice(1)}`;
  if (cleaned.startsWith('7')) return `254${cleaned}`;
  if (cleaned.startsWith('254')) return cleaned;
  
  return null;
};

/**
 * Formats currency for Kenya (KES)
 */
exports.formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  }).format(amount);
};

/**
 * Formats dates for Kenyan context
 */
exports.formatKenyanDate = (date) => {
  return new Date(date).toLocaleDateString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Masks sensitive Kenyan ID numbers
 */
exports.maskKenyanID = (id) => {
  if (!id) return '';
  return `${id.substring(0, 2)}******${id.slice(-2)}`;
};
