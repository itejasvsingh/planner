/**
 * Reads a mutual fund purchase / SIP / redemption confirmation (an SMS or an email from an AMC, CAMS, KFintech, Groww, Zerodha Coin ...)
 * by its wording, with no AI. Keeps only the fund's name and the numbers. No imports, so tests can load it.
 * Not read: stock contract notes and FD receipts vary too much per broker/bank; those stay manual.
 */
export type InvestEvent = {
  kind: 'buy' | 'sell';
  name: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  /** Order / reference number when the message has one (used to count a message once). */
  ref: string | null;
};

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const SELL = /\b(redeem(?:ed)?|redemption|withdraw(?:al|n)|switch(?:ed)? out|sold)\b/i;
const BUY = /\b(purchas(?:e|ed)|allot(?:ted|ment)|invest(?:ed|ment)|sip|subscri(?:be|bed|ption)|bought|switch(?:ed)? in)\b/i;
const NOT = /\b(otp|offer|discount|loan|insurance premium|statement is ready|reminder)\b/i;
const FUND = /([A-Z][A-Za-z0-9&.'()]*(?:\s+[A-Za-z0-9&.'()\-–]+){0,9}?\s+(?:Fund|ETF|FoF|Scheme|Index)(?:\s*[-–]\s*[A-Za-z]+\s+(?:Plan\s*)?[-–]?\s*(?:Growth|IDCW|Dividend)(?:\s+Option)?|\s+(?:Direct|Regular)\s+(?:Plan\s*)?(?:[-–]\s*)?(?:Growth|IDCW|Dividend)?(?:\s+Option)?|\s+(?:Growth|IDCW)(?:\s+Option)?)?)/;

export function parseInvestment(raw: string): InvestEvent | null {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (text.length < 20 || NOT.test(text)) return null;
  const m = text.match(FUND);
  if (!m) return null;
  let name = m[1].replace(/^(?:in|of|to|from|your|the|for)\s+/i, '').trim();
  // "Redemption of 1.75 units of HDFC ... Fund": the name starts after the last connecting word of the lead-in
  if (/^(?:redemption|purchase|allotment|sip|investment|switch|order|request|units?)\b/i.test(name)) {
    const cuts = [' units of ', ' in ', ' of ', ' from ', ' to ', ' for '].map((w) => name.toLowerCase().lastIndexOf(w) + (name.toLowerCase().lastIndexOf(w) < 0 ? 0 : w.length));
    name = name.slice(Math.max(...cuts)).trim();
  }
  if (name.split(' ').length < 2) return null;
  const units = text.match(/(?:units?(?:\s+allotted)?|allotted)\s*(?:of|[:=-])?\s*(\d[\d,]*\.?\d*)|(\d[\d,]*(?:\.\d+)?)\s+units?\b/i);
  const unitsN = units ? num(units[1] || units[2]) : null;
  const nav = text.match(/\bnav\b\s*(?:of|is|[:=@-])?\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*\.?\d*)/i);
  const amount = text.match(/(?:rs\.?|inr|₹)\s*(\d[\d,]*\.?\d*)/i);
  const ref = text.match(/\b(?:order|folio|ref(?:erence)?|txn|transaction)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*([A-Z0-9]{6,20})\b/i);
  const sell = SELL.test(text);
  if (!sell && !BUY.test(text)) return null;
  const amt = amount ? num(amount[1]) : null;
  if (!(unitsN && unitsN > 0) && !(amt && amt > 0)) return null;
  return {
    kind: sell ? 'sell' : 'buy',
    name,
    amount: amt && amt > 0 ? amt : null,
    units: unitsN && unitsN > 0 ? unitsN : null,
    nav: nav && num(nav[1]) > 0 ? num(nav[1]) : null,
    ref: ref ? ref[1].toUpperCase() : null,
  };
}

/** The words of a fund name that identify it, without plan noise (to look it up in AMFI's list). */
export const nameWords = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !['plan', 'option', 'fund', 'scheme', 'the'].includes(w));

/** Where fund confirmations come from (AMCs, registrars, apps); read from Gmail in the last 30 days. */
export const INVEST_SENDERS = [
  'camsonline.com', 'kfintech.com', 'mfcentral.com', 'zerodha.com', 'groww.in', 'kuvera.in', 'indmoney.com', 'paytmmoney.com', 'etmoney.com',
  'hdfcfund.com', 'axismf.com', 'sbimf.com', 'icicipruamc.com', 'nipponindiaim.com', 'kotakmf.com', 'ppfas.com', 'utimf.com', 'adityabirlacapital.com',
];
export const investQuery = (afterSec: number) => `from:(${INVEST_SENDERS.join(' OR ')}) {units allotted purchase redemption redeemed SIP} after:${Math.floor(afterSec)} -in:spam -in:trash`;
