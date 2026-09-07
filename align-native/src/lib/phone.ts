export function formatPhone(phone: string | null) {
  if (!phone) return '';
  const countryCodeLength = phone.length > 10 ? phone.length - 10 : 0;
  const countryCode = countryCodeLength ? `+${phone.slice(0, countryCodeLength)}` : '';
  return `${countryCode} ******${phone.slice(-4)}`;
}

export function normalizePhone(phone: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export function isValidPhone(phone: string | null) {
  const cleaned = normalizePhone(phone);
  return cleaned.length >= 10;
}
