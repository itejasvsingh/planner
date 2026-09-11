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

export function getPhoneVariants(phone: string | null): string[] {
  if (!phone) return [];
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(digits);
  if (digits.length === 10) {
    variants.add(`91${digits}`);
    variants.add(`+91${digits}`);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    variants.add(digits.slice(2));
    variants.add(`+${digits}`);
  }
  return Array.from(variants);
}
