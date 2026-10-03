/**
 * The key a merchant's category rule is stored under: "ISTHARA PARKS PRIVATE LIMITED" and "Isthara Parks"
 * are the same merchant. Mirrors align-native/src/lib/merchant-key.ts (tests/merchant-rules.test.cjs checks
 * they agree). Pure.
 */
export function merchantKey(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:private limited|pvt ltd|pvt|ltd|limited|llp|inc|co)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
