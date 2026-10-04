import { BANKS } from './bankSenders';

/**
 * Account details in bank and card messages (SMS or email text), beyond the transaction itself:
 * the available balance an alert quotes, which account or credit card it's about, and how much a
 * card payment confirmation says was paid. Only these numbers are kept, never the message.
 */

const AMOUNT = String.raw`(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)`;
// "Avl Bal Rs 12,345.67", "Available Balance: INR 5,000", "A/c balance is Rs.100" (but not "Avl Lmt")
const BALANCE = new RegExp(
  String.raw`\b(?:avl\.?|avail\.?|available|a\/c|account|clear|net\s+avl\.?)\s*(?:bal(?:ance)?\.?)(?:\s+is)?\s*(?::|-|=)?\s*` + AMOUNT,
  'i',
);
const ACCOUNT_LAST4 = /\b(?:a\/c|acct|account|ac)\b(?:\s*no\.?)?[^\n\d]{0,12}?(?:x+|\*+|•+|ending\s*(?:in|with)?\s*)(\d{3,4})\b/i;
const CARD_LAST4 = /\bcard\b[^\n]{0,30}?(?:ending|no\.?|number)?\s*(?:in|with|:)?\s*(?:x+|\*+|•+)\s*(\d{4})\b|\bcard\b[^\n]{0,30}?\bending\s+(?:in|with)?\s*(\d{4})\b/i;

const toNumber = (s: string) => parseFloat(s.replace(/,/g, ''));

/** The available balance an account alert quotes, with the account's last digits when given. */
export function availableBalance(text: string): { balance: number; last4: string | null } | null {
  const m = text.match(BALANCE);
  if (!m) return null;
  const balance = toNumber(m[1]);
  if (!Number.isFinite(balance)) return null;
  // A credit card's available limit isn't a bank balance
  if (/credit\s*card/i.test(text) && !/\ba\/c\b|savings|current\s+a/i.test(text)) return null;
  return { balance, last4: text.match(ACCOUNT_LAST4)?.[1]?.slice(-4) || null };
}

/** The credit card a spend alert is about (its last four digits), or null for bank accounts and debit cards. */
export function creditCardOf(text: string): { last4: string } | null {
  if (!/credit\s*card|\bcc\b/i.test(text) || /debit\s*card/i.test(text)) return null;
  const m = text.match(CARD_LAST4);
  const last4 = m ? m[1] || m[2] : null;
  return last4 ? { last4 } : null;
}

/** "Thank you for your payment of Rs 12,450.50 towards your card": the amount paid. */
export function cardPaymentAmount(text: string): number | null {
  const m = text.match(new RegExp(String.raw`\bpayment\b[^.\n]{0,40}?` + AMOUNT, 'i')) || text.match(new RegExp(AMOUNT + String.raw`[^.\n]{0,60}?\b(?:payment|received|credited)\b`, 'i'));
  const n = m ? toNumber(m[1]) : NaN;
  return n > 0 ? n : null;
}

// How banks name themselves in SMS, for messages that have no sender address
const SMS_NAMES: Record<string, string[]> = {
  hdfc: ['HDFC'], icici: ['ICICI'], sbi: ['SBI', 'State Bank'], sbicard: ['SBI Card'], axis: ['Axis'], kotak: ['Kotak'],
  yes: ['YES Bank'], idfc: ['IDFC'], indusind: ['IndusInd'], au: ['AU Bank', 'AU Small Finance'], federal: ['Federal Bank'],
  bob: ['Bank of Baroda', 'BOB', 'BOBCARD'], pnb: ['PNB', 'Punjab National'], canara: ['Canara'], union: ['Union Bank'],
  boi: ['Bank of India'], idbi: ['IDBI'], rbl: ['RBL'], bandhan: ['Bandhan'], iob: ['IOB'], indian: ['Indian Bank'],
  sc: ['StanChart', 'Standard Chartered'], hsbc: ['HSBC'], citi: ['Citi'], dbs: ['DBS'], amex: ['Amex', 'American Express'],
  onecard: ['OneCard'], slice: ['slice'], jupiter: ['Jupiter'], fi: ['Fi Money'],
};

/** The bank a message names (longest match wins, so "SBI Card" beats "SBI"). */
export function bankFromText(text: string): { id: string; name: string } | null {
  let best: { id: string; len: number } | null = null;
  for (const [id, names] of Object.entries(SMS_NAMES)) {
    for (const n of names) {
      if (new RegExp(String.raw`\b${n.replace(/ /g, '\\s+')}\b`, 'i').test(text) && (!best || n.length > best.len)) best = { id, len: n.length };
    }
  }
  const bank = best && BANKS.find((b) => b.id === best!.id);
  return bank ? { id: bank.id, name: bank.name } : null;
}
