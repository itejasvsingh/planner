/**
 * Transactions worth a second look, from your own history (last 90 days). Pure (no imports) so tests can
 * load it directly (tests/suspicious.test.cjs). Only money that left automatically recorded accounts
 * (SMS, email, Gmail, statements) is checked: what you typed in yourself is yours, transfers to family or
 * your own accounts are never flagged, and anything you've reviewed stays quiet.
 */

export type Txn = {
  id: string;
  type?: string;
  title?: string;
  amount?: string | number;
  date?: string | null;
  time?: string | null;
  source?: string;
  autoDetected?: boolean;
  ref?: string | null;
  cardLast4?: string | null;
  review?: 'mine' | 'not_me' | null;
};

export type Flag = { item: Txn; reasons: string[]; score: number };

const AUTOMATIC = new Set(['sms', 'email', 'gmail', 'statement']);
const DAY = 86400000;
const amountOf = (t: Txn) => {
  const n = Number(t.amount);
  return Number.isFinite(n) ? n : 0;
};
/** Same idea as the server's merchantKey: case, punctuation and "Pvt Ltd" don't matter. */
const payee = (t: Txn) =>
  (t.title || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+(private limited|pvt ltd|pvt|ltd|limited|llp|inc|co)\s*$/, '').trim();
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const FOREIGN = /\b(usd|eur|gbp|aed|sgd|jpy|aud|cad|intl|international|forex|cross[\s-]?border)\b|\$/i;

/**
 * Checks spends from the last `days` days (default 30) against the 90 days before `today` (YYYY-MM-DD).
 * Returns the flagged ones, most concerning first.
 */
export function findSuspicious(items: Txn[], today: string, days = 30): Flag[] {
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const since = new Date(t0 - days * DAY).toISOString().slice(0, 10);
  const history = new Date(t0 - 90 * DAY).toISOString().slice(0, 10);
  const spends = items.filter((i) => i.type === 'expense' && (i.date || '') >= history && amountOf(i) > 0);
  const typical = spends.map(amountOf);
  const p90 = percentile(typical, 0.9);
  const med = median(typical);

  // History per payee, to know what's usual for each
  const byPayee = new Map<string, Txn[]>();
  for (const s of spends) {
    const k = payee(s);
    if (!k) continue;
    if (!byPayee.has(k)) byPayee.set(k, []);
    byPayee.get(k)!.push(s);
  }

  const flags: Flag[] = [];
  for (const t of spends) {
    if ((t.date || '') < since || t.review || !(t.autoDetected || AUTOMATIC.has(t.source || ''))) continue;
    const amt = amountOf(t);
    const k = payee(t);
    const others = (byPayee.get(k) || []).filter((o) => o.id !== t.id);
    const earlier = others.filter((o) => `${o.date} ${o.time || ''}` < `${t.date} ${t.time || ''}`);
    const reasons: string[] = [];
    let score = 0;

    // The same charge twice within minutes (or the same day when there's no time), with no proof they differ
    const twin = others.find((o) => {
      if (Math.abs(amountOf(o) - amt) > 0.009 || o.date !== t.date) return false;
      if (t.ref && o.ref && t.ref !== o.ref && o.source === t.source) return false;
      if (t.time && o.time) return Math.abs(toMin(t.time) - toMin(o.time)) <= 10;
      return !t.time || !o.time ? o.source === t.source : false;
    });
    if (twin && amt >= 100) { reasons.push(`Charged twice: ${inr(amt)} to ${t.title || 'the same payee'} ${t.time && twin.time ? 'within minutes' : 'on the same day'}`); score += 3; }

    // A big payment to someone new
    if (!earlier.length && k && amt >= Math.max(5000, 3 * med)) { reasons.push(`First payment to ${t.title}, and a large one (${inr(amt)})`); score += 2; }

    // Much more than usual at this payee
    if (earlier.length >= 3) {
      const usual = median(earlier.map(amountOf));
      if (amt >= 1000 && amt > 3 * usual) { reasons.push(`${inr(amt)} at ${t.title}: you usually spend about ${inr(usual)} there`); score += 2; }
    }

    // Far above anything you normally spend
    if (amt >= 10000 && typical.length >= 10 && amt > 5 * p90) { reasons.push(`Much bigger than your usual spends (most are under ${inr(p90)})`); score += 2; }

    // Small hours
    if (t.time && toMin(t.time) >= 60 && toMin(t.time) < 300 && amt >= 500) { reasons.push(`At ${t.time}, in the middle of the night`); score += 1; }

    // Foreign currency / international
    if (FOREIGN.test(t.title || '')) { reasons.push('Looks like an international or foreign-currency payment'); score += 2; }

    if (reasons.length) flags.push({ item: t, reasons, score });
  }
  return flags.sort((a, b) => b.score - a.score || `${b.item.date}${b.item.time || ''}`.localeCompare(`${a.item.date}${a.item.time || ''}`));
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
