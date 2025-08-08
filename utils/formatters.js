// utils/formatters.js

/**
 * Format currency amount with flexible currency symbol
 */
const formatCurrency = (amount, currency = 'KES', locale = 'en-KE') => {
  if (!amount || isNaN(amount)) return `${currency} 0.00`;
  
  if (currency === 'KES') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount);
  }
  
  const formatted = parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${currency} ${formatted}`;
};

/**
 * Format phone number for Kenya with multiple format support
 */
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Handle different formats
  if (cleaned.startsWith('254')) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('07')) {
    return `+254${cleaned.substring(1)}`;
  } else if (cleaned.startsWith('7')) {
    return `+254${cleaned}`;
  } else if (cleaned.length === 9) {
    return `+254${cleaned}`;
  }
  
  return phoneNumber; // Return original if can't format
};

/**
 * Format phone number specifically for Kenya (without + prefix)
 */
const formatKenyanPhone = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Handle different formats - return 254XXXXXXXX format
  if (cleaned.startsWith('254')) {
    return cleaned;
  } else if (cleaned.startsWith('07')) {
    return `254${cleaned.substring(1)}`;
  } else if (cleaned.startsWith('7')) {
    return `254${cleaned}`;
  } else if (cleaned.length === 9) {
    return `254${cleaned}`;
  }
  
  return null; // Return null for invalid numbers
};

/**
 * Format date to readable string with flexible options
 */
const formatDate = (date, options = {}, locale = 'en-US') => {
  if (!date) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Africa/Nairobi',
    ...options
  };
  
  return new Date(date).toLocaleDateString(locale, defaultOptions);
};

/**
 * Format date specifically for Kenyan context
 */
const formatKenyanDate = (date) => {
  return formatDate(date, {}, 'en-KE');
};

/**
 * Format date and time
 */
const formatDateTime = (date) => {
  if (!date) return '';
  
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Nairobi'
  });
};

/**
 * Format transaction status
 */
const formatTransactionStatus = (status) => {
  const statusMap = {
    'pending': 'Pending',
    'completed': 'Completed',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'processing': 'Processing'
  };
  
  return statusMap[status?.toLowerCase()] || status;
};

/**
 * Format file size
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Truncate text
 */
const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Format property address
 */
const formatAddress = (address) => {
  if (!address) return '';
  
  const parts = [];
  
  if (address.street) parts.push(address.street);
  if (address.area) parts.push(address.area);
  if (address.city) parts.push(address.city);
  if (address.county) parts.push(address.county);
  
  return parts.join(', ');
};

/**
 * Generate reference number
 */
const generateReference = (prefix = 'REF', length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

/**
 * Format percentage
 */
const formatPercentage = (value, decimals = 1) => {
  if (!value || isNaN(value)) return '0%';
  return `${parseFloat(value).toFixed(decimals)}%`;
};

/**
 * Sanitize filename
 */
const sanitizeFilename = (filename) => {
  if (!filename) return '';
  
  // Remove invalid characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
};

/**
 * Masks sensitive Kenyan ID numbers
 */
const maskKenyanID = (id) => {
  if (!id) return '';
  return `${id.substring(0, 2)}******${id.slice(-2)}`;
};

module.exports = {
  formatCurrency,
  formatPhoneNumber,
  formatKenyanPhone,
  formatDate,
  formatKenyanDate,
  formatDateTime,
  formatTransactionStatus,
  formatFileSize,
  truncateText,
  formatAddress,
  generateReference,
  formatPercentage,
  sanitizeFilename,
  maskKenyanID,
  // Aliases for backward compatibility
  kenyaPhoneFormatter: formatKenyanPhone
};