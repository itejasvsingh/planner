import { cleanMerchant, guessCategory, parseDate, parseTime, parseTransactionSms, type ParsedTransaction } from './smsParse';

/**
 * Reads bank and card alert emails from any bank. They state the transaction in a sentence ("₹20 debited
 * from your account…"), in labelled rows ("Amount | ₹20", "To | NAME", "RRN | 6275…"), or both, surrounded
 * by greetings, disclaimers ("never share your OTP") and offers that would make the SMS rules reject the
 * whole message. Only imports the SMS parser (tests load both).
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

// ---------------------------------------------------------------- labelled rows

type Fields = { amount?: number; date?: string; time?: string; payee?: string; payer?: string; ref?: string };

const ROWS: [keyof Fields, RegExp][] = [
  ['ref', /^(?:upi\s+)?(?:rrn|utr(?:\s*no\.?)?|ref(?:erence)?(?:\s*(?:no\.?|number|id))?|transaction\s*(?:id|ref(?:erence)?(?:\s*no\.?)?)|txn\s*(?:id|ref(?:\s*no\.?)?))\b\s*[:#-]?\s*(.+)$/i],
  ['amount', /^(?:transaction\s+|txn\s+|debit(?:ed)?\s+|credit(?:ed)?\s+)?(?:amount|amt)(?:\s*\([^)]*\))?\b\s*[:-]?\s*(.+)$/i],
  ['date', /^(?:transaction\s+|txn\s+)?date(?:\s*(?:&|and)\s*time)?\b\s*[:-]?\s*(.+)$/i],
  ['time', /^(?:transaction\s+|txn\s+)?time\b\s*[:-]?\s*(.+)$/i],
  ['payee', /^(?:to|paid\s+to|payee(?:\s+name)?|beneficiary(?:\s+name)?|merchant(?:\s+name)?|sent\s+to|transferred\s+to|recipient|at|info)\b\s*[:-]?\s*(.+)$/i],
  ['payer', /^(?:from|received\s+from|sender(?:\s+name)?|remitter(?:\s+name)?|paid\s+by|credited\s+by)\b\s*[:-]?\s*(.+)$/i],
];

/** Labelled rows anywhere in the email, one per line ("Amount ₹20.00", "To ISTHARA PARKS", "RRN 6275…"). */
export function alertFields(text: string): Fields {
  const f: Fields = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 120) continue;
    for (const [key, re] of ROWS) {
      if (f[key] !== undefined) continue;
      const m = line.match(re);
      if (!m) continue;
      const value = m[1].trim();
      if (key === 'amount') {
        const a = value.match(/(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
        const n = a ? parseFloat(a[1].replace(/,/g, '')) : NaN;
        if (n > 0) f.amount = n;
      } else if (key === 'date') {
        const d = parseDate(value);
        if (d) f.date = d;
        const t = parseTime(value);
        if (t && !f.time) f.time = t;
      } else if (key === 'time') {
        const t = parseTime(value);
        if (t) f.time = t;
      } else if (key === 'ref') {
        const r = value.match(/\b([A-Za-z0-9]*\d[A-Za-z0-9]{5,})\b/);
        if (r) f.ref = r[1];
      } else if (!/^(?:your|my|the|a\/c|ac\b|account|xx|\*|\d)/i.test(value)) {
        f[key] = value.slice(0, 60);
      }
      break;
    }
  }
  return f;
}

// Not a completed transaction, even if amounts and "credit" appear (statements, OTPs, reminders, offers).
const NOT_A_TRANSACTION = /\botp\b|one[- ]time password|statement (?:is|for)|e-?statement|is due|due date|payment reminder|minimum (?:amount )?due|\boffer\b|pre-?approved|\bdeclined\b|\bfailed\b|\bunsuccessful\b/i;
const DEBIT_VERB = /\b(?:debited|spent|paid|sent|withdrawn|deducted|purchase|used for a? ?transaction|thank you for using)\b/i;
const CREDIT_VERB = /\b(?:credited|received|deposited|refunded|refund|cashback)\b/i;

/** Money out or in, from whichever verb comes first ("credit card" is not a credit). */
function direction(text: string): 'expense' | 'income' | null {
  const t = text.replace(/credit\s*card/gi, 'card');
  let d = t.search(DEBIT_VERB);
  let c = t.search(CREDIT_VERB);
  if (d < 0 && c < 0) {
    // "A debit transaction has been made…"
    d = t.search(/\bdebit\b/i);
    c = t.search(/\bcredit\b/i);
  }
  if (d < 0 && c < 0) return null;
  if (c < 0 || (d >= 0 && d < c)) return 'expense';
  return 'income';
}

const GENERIC_NAME = /^(?:card \/ upi payment|money received)$/i;

/**
 * The transaction in a bank or card alert email, from any bank, or null. The sentence reader runs first; the
 * labelled rows fill in what it couldn't (payee, reference, date) or stand in when the email has no sentence.
 */
export function parseBankEmail(text: string): ParsedTransaction | null {
  const subject = text.split('\n')[0] || '';
  const window = alertWindow(text);
  const fromSentence = window ? parseTransactionSms(window) : null;
  const fields = alertFields(text);

  let type = fromSentence?.type ?? null;
  let amount = fromSentence?.amount ?? null;
  if (!fromSentence) {
    // Rows only: needs an amount, a direction and something that ties it to a payment.
    if (NOT_A_TRANSACTION.test(subject) || NOT_A_TRANSACTION.test(text.slice(0, 600))) return null;
    if (!fields.amount || !(fields.ref || fields.payee || fields.payer)) return null;
    type = direction(text);
    amount = fields.amount;
    if (!type) return null;
  }

  const named = type === 'expense' ? fields.payee : fields.payer;
  let merchant = fromSentence?.merchant || '';
  if ((!merchant || GENERIC_NAME.test(merchant)) && named) merchant = cleanMerchant(named);
  if (!merchant) merchant = type === 'expense' ? 'Card / UPI payment' : 'Money received';

  return {
    type: type!,
    amount: amount!,
    merchant,
    category: guessCategory(`${merchant} ${text.slice(0, 1500)}`, type!),
    ref: fromSentence?.ref || fields.ref || null,
    date: fromSentence?.date || fields.date || null,
    time: fromSentence?.time || fields.time || null,
  };
}
