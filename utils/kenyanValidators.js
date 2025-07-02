const KRA_PIN_REGEX = /^[A-Z]{1}\d{9}[A-Z]{1}$/;

module.exports = {
  /**
   * Validates Kenyan phone numbers (2547XXXXXXXX or 2541XXXXXXXX)
   */
  validatePhone: (phone) => {
    return /^254(7|1)\d{8}$/.test(phone);
  },

  /**
   * Validates Kenyan National ID (8 digits with checksum)
   */
  validateNationalID: (id) => {
    if (!/^\d{8}$/.test(id)) return false;
    
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
   * Validates KRA PIN format
   */
  validateKRAPin: (pin)
