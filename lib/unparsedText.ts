/**
 * Messages that look like a bank transaction but weren't understood. Pure (no imports), tested in tests/unparsed.test.cjs.
 * `looksLikeTransaction` is deliberately strict (an amount and a payment word, and not a code, an offer or a reminder),
 * so the "Couldn't read" list holds real misses, not noise. `maskDigits` hides account, card and reference numbers.
 */
const AMOUNT = /(?:rs\.?|inr|₹)[.:]?\s*\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹)/i;
const PAYMENT = /\b(?:debited|credited|spent|paid|sent|received|withdrawn|deducted|purchase|txn|transaction|transferred)\b/i;
const NOT = /\botp\b|one[- ]time password|\bpin\b|\bcvv\b|\boffer\b|\bwin\b|pre-?approved|apply now|click here|\bemi offer|reminder|minimum (?:amount )?due|statement|is due|due date|\bdeclined\b|\bfailed\b|\bunsuccessful\b|\brequest\b/i;

export function looksLikeTransaction(text: string): boolean {
  const t = String(text || '');
  return t.length >= 20 && t.length <= 2000 && AMOUNT.test(t) && PAYMENT.test(t) && !NOT.test(t);
}

/** Runs of five or more digits (account numbers, references, card numbers) become dots; short amounts and dates stay. */
export function maskDigits(text: string, max = 200): string {
  return String(text || '').replace(/\d{5,}/g, (m) => '•'.repeat(m.length)).replace(/\s+/g, ' ').trim().slice(0, max);
}
