/**
 * Bank alert emails carry the transaction in one or two sentences surrounded by greetings, disclaimers
 * ("never share your OTP") and offers that would make the SMS rules reject the whole message. This picks
 * out the transaction part so it can go through the same parser as an SMS. Pure (no imports) for tests.
 */

const AMOUNT = /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹)|\b(?:debited|credited)\s+(?:by|with|for)\s+[\d,]+(?:\.\d{1,2})?/i;
const MONEY_WORD = /debit|credit|spent|paid|sent|received|withdrawn|deducted|purchase|transaction|used for|thank you for using/i;
// Sentences that are never part of the transaction itself.
const NOISE = /\botp\b|one[- ]time password|\boffer\b|\bget (?:rs|inr|₹|flat|up ?to)|\bcashback on\b|limited period|\bvoucher\b|\bcoupon\b|pre-?approved|\bis due\b|due date|\bminimum (?:amount )?due\b|do not reply|unsubscribe|disclaimer|this is a system generated/i;
// "A/c no. XX1234" and "Rs. 250" are not sentence ends.
const NOT_AN_END = /(?:\bno|\brs|\bnos|\ba\/c|\bac|\bvs|\bdt|\bref)\.$/i;

function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9*])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && NOT_AN_END.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

/** The transaction sentence and the one or two after it (date, ref, merchant), or null if there is none. */
export function alertWindow(text: string): string | null {
  const s = sentences(text);
  const i = s.findIndex(x => AMOUNT.test(x) && MONEY_WORD.test(x) && !NOISE.test(x));
  if (i < 0) return null;
  const picked = [s[i]];
  for (const next of s.slice(i + 1, i + 3)) {
    if (NOISE.test(next) || /^(?:warm )?regards|^sincerely|^if you (?:did not|have not)/i.test(next)) break;
    picked.push(next);
  }
  return picked.join(' ').slice(0, 500);
}
