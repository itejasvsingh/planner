/**
 * Phone formats, matching align-native/src/lib/phone.ts (tests/phone-auth.test.cjs checks they agree).
 * Items are stored with ownerId in any of these spellings, so a signed-in user may access all of them.
 */

export function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export function isValidPhone(phone: string): boolean {
  return /^\d{11,15}$/.test(phone);
}

export function getPhoneVariants(phone: string | null | undefined): string[] {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set<string>([digits]);
  if (digits.length === 10) {
    variants.add(`91${digits}`);
    variants.add(`+91${digits}`);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    variants.add(digits.slice(2));
    variants.add(`+${digits}`);
  }
  return Array.from(variants);
}
