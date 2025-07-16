const KRA_PIN_REGEX = /^[A-Z]{1}\d{9}[A-Z]{1}$/;
const SAFARICOM_PHONE_REGEX = /^254(7|1)\d{8}$/;
const NATIONAL_ID_REGEX = /^\d{8}$/;
const LEASE_DURATION_REGEX = /^\d+(months|years)$/;

module.exports = {
  /**
   * Validates Kenyan phone numbers (2547XXXXXXXX or 2541XXXXXXXX)
   */
  validatePhone: (phone) => SAFARICOM_PHONE_REGEX.test(phone),

  /**
   * Validates Kenyan National ID (8 digits with checksum)
   */
  validateNationalID: (id) => {
    if (!NATIONAL_ID_REGEX.test(id)) return false;
    
    const digits = id.split('').map(Number);
    const lastDigit = digits.pop();
    let sum = 0;
    
    digits.forEach((d, i) => {
      sum += d * (digits.length + 1 - i);
    });
    
    return (sum % 11) % 10 === lastDigit;
  },

  /**
   * Validates rent increase per Kenyan law (max 7% annually)
   */
  validateRentIncrease: (oldRent, newRent) => {
    const maxIncrease = oldRent * 0.07;
    return newRent <= oldRent + maxIncrease;
  },

  /**
   * Validates KRA PIN format (Letter + 9 digits + Letter)
   */
  validateKRAPin: (pin) => KRA_PIN_REGEX.test(pin),

  /**
   * Validates lease duration format (e.g., "12months" or "2years")
   */
  validateLeaseDuration: (duration) => LEASE_DURATION_REGEX.test(duration),

  /**
   * Validates M-Pesa transaction amounts (min 10 KES, max 150K KES)
   */
  validateMpesaAmount: (amount) => amount >= 10 && amount <= 150000,

  /**
   * Validates property coordinates (latitude/longitude)
   */
  validateCoordinates: (lat, lng) => {
    return (
      lat >= -4.7 && lat <= 5.0 && // Kenya's approximate lat range
      lng >= 33.9 && lng <= 41.9   // Kenya's approximate lng range
    );
  },

  /**
   * Validates Kenyan postal code (5 digits)
   */
  validatePostalCode: (code) => /^\d{5}$/.test(code),
};