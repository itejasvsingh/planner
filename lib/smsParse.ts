/**
 * Rule-based parser for Indian bank / UPI / card transaction SMS and alert text.
 * Returns null for anything that is not a completed debit or credit (OTPs, reminders, offers, balances).
 */

export type ParsedTransaction = {
  type: 'expense' | 'income';
  amount: number;
  merchant: string;
  category: string;
  /** Bank / UPI reference, used to de-duplicate the same payment arriving twice. */
  ref: string | null;
  /** YYYY-MM-DD if the message carries a date, else null (caller uses "today"). */
  date: string | null;
};

const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const AMOUNT_AFTER = /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i;
// SBI-style "debited by 1,499.00" with no currency marker
const AMOUNT_AFTER_VERB = /\b(?:debited|credited|spent|paid)\s+(?:by|for|with|of)\s+([\d,]+(?:\.\d{1,2})?)/i;

const NOT_A_TRANSACTION = [
  /\botp\b/i,
  /one[- ]time password/i,
  /\bwill be (?:debited|deducted|charged)\b/i,
  /\b(?:is|are) due\b/i,
  /\bdue (?:date|on|by)\b/i,
  /\brequest(?:ed)? (?:of|for|money)\b/i,
  /\bhas requested\b/i,
  /\bpayment reminder\b/i,
  /\b(?:failed|declined|unsuccessful|reversed)\b/i,
  /\bpre-?approved\b/i,
  /\boffer\b/i,
];

const DEBIT = /\b(?:debited|spent|paid|sent|withdrawn|deducted|purchase|txn of|charged|dr\b|debit(?:ed)? (?:by|for|with))/i;
const CREDIT = /\b(?:credited|received|deposited|refund(?:ed)?|cashback|cr\b)/i;

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['Food & Dining', /swiggy|zomato|eatsure|domino|pizza|kfc|mcdonald|starbucks|cafe|restaurant|food/i],
  ['Groceries', /blinkit|zepto|bigbasket|instamart|dmart|grofers|jiomart|grocery|supermarket/i],
  ['Transport', /uber|\bola\b|rapido|irctc|redbus|metro|fastag|petrol|fuel|indigo|air ?india|vistara|makemytrip|goibibo/i],
  ['Shopping', /amazon|flipkart|myntra|ajio|nykaa|meesho|tata ?cliq|croma|reliance digital/i],
  ['Bills & Recharge', /airtel|jio|\bvi\b|vodafone|bsnl|recharge|electricity|bescom|tata ?power|broadband|act fibernet|bill ?desk|billpay/i],
  ['Entertainment', /netflix|spotify|hotstar|prime video|youtube|bookmyshow|pvr|inox|steam|playstation/i],
  ['Health', /pharm|apollo|medplus|1mg|practo|hospital|clinic|cult\.?fit|gym/i],
  ['Education', /udemy|coursera|byju|unacademy|school|college|university|tuition/i],
];

function parseAmount(text: string): number | null {
  const m = text.match(AMOUNT) || text.match(AMOUNT_AFTER) || text.match(AMOUNT_AFTER_VERB);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanMerchant(raw: string): string {
  let s = raw
    .replace(/@[\w.-]+/g, '') // VPA handle suffix
    .replace(/\b(?:upi|imps|neft|rtgs|pos|ecom|ref|on|via|using|txn|a\/c|ac)\b.*$/i, '')
    .replace(/[^\w &'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(?:mr|mrs|ms)\.?\s+/i, '');
  if (!s) return '';
  return s.length > 40 ? s.slice(0, 40).trim() : s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseMerchant(text: string, type: 'expense' | 'income'): string {
  const patterns: RegExp[] =
    type === 'expense'
      ? [
          /\btrf to\s+([^.\n]+?)(?:\s+refno|\s+ref|\.|$)/i,
          /\bto\s+vpa\s+([\w.@-]+)/i,
          /;\s*([A-Za-z][^;.\n]+?)\s+credited/i, // "...debited; MERCHANT credited"
          /\b(?:at|to|towards|for)\s+([A-Za-z][^.\n]{1,40}?)(?:\s+on\s|\s+via\s|\s+using\s|\s+ref|\s+upi|\.|,|$)/i,
          /\binfo:?\s*(?:upi\/)?(?:p2[am]\/)?(?:\d+\/)?([A-Za-z][\w &.-]{1,40})/i,
        ]
      : [
          /\bfrom\s+vpa\s+([\w.@-]+)/i,
          /\b(?:from|by)\s+([A-Za-z][^.\n]{1,40}?)(?:\s+on\s|\s+via\s|\s+ref|\s+upi|\.|,|$)/i,
        ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = cleanMerchant(m[1]);
      if (name && !/^(?:your|a\/c|ac|account|xx|\*)/i.test(name)) return name;
    }
  }
  return '';
}

function parseRef(text: string): string | null {
  const m =
    text.match(/\b(?:upi\s*)?ref(?:erence)?\.?\s*(?:no\.?|number|id)?\s*[:.\-]?\s*(\d{6,})/i) ||
    text.match(/\b(?:txn|transaction)\s*(?:id|no\.?)?\s*[:.\-]?\s*([A-Z0-9]{8,})/i) ||
    text.match(/\bimps\s*(?:ref)?\s*[:.\-]?\s*(\d{6,})/i);
  return m ? m[1] : null;
}

function parseDate(text: string): string | null {
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n: number) => String(n).padStart(2, '0');
  const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
  let m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const d = +m[1], mo = +m[2], y = fullYear(+m[3]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = text.match(/\b(\d{1,2})[- ]?([A-Za-z]{3})[a-z]*[- ,]?(\d{2,4})\b/);
  if (m && months[m[2].toLowerCase()]) {
    const d = +m[1], y = fullYear(+m[3]);
    if (d >= 1 && d <= 31) return `${y}-${pad(months[m[2].toLowerCase()])}-${pad(d)}`;
  }
  return null;
}

export function guessCategory(text: string, type: 'expense' | 'income'): string {
  if (type === 'income') {
    if (/salary|payroll/i.test(text)) return 'Salary';
    if (/refund|cashback|reversal/i.test(text)) return 'Refund';
    return 'Money Received';
  }
  for (const [name, re] of CATEGORY_KEYWORDS) if (re.test(text)) return name;
  return 'Other';
}

export function parseTransactionSms(text: string): ParsedTransaction | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || NOT_A_TRANSACTION.some((re) => re.test(t))) return null;

  const isDebit = DEBIT.test(t);
  const isCredit = CREDIT.test(t);
  // "Rs 500 debited ... MERCHANT credited" is a debit; plain "credited to your a/c" is income
  let type: 'expense' | 'income' | null = null;
  if (isDebit) type = 'expense';
  else if (isCredit) type = 'income';
  if (!type) return null;

  const amount = parseAmount(t);
  if (!amount) return null;

  const merchant = parseMerchant(t, type);
  return {
    type,
    amount,
    merchant: merchant || (type === 'expense' ? 'Card / UPI payment' : 'Money received'),
    category: guessCategory(`${merchant} ${t}`, type),
    ref: parseRef(t),
    date: parseDate(t),
  };
}
