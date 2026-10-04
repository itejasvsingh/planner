/**
 * The last 90 days at a glance: totals, month by month, week by week, where the money went (and whether
 * that's rising or falling), the places you pay most, and plain-language notes. Pure (no imports) so tests
 * can load it directly (tests/overview90.test.cjs). Transfers (family, your own accounts) are shown apart
 * and never counted as spending.
 */

export type Txn = { id: string; type?: string; title?: string; amount?: number | string | null; date?: string | null; category?: string };

export type Overview = {
  from: string;
  to: string;
  spent: number;
  income: number;
  transfers: number;
  perDay: number;
  /** Three 30-day windows, oldest first: 61–90, 31–60 and the last 30 days. */
  months: { from: string; to: string; spent: number; income: number }[];
  /** Thirteen weeks of spending, oldest first. */
  weeks: { from: string; spent: number }[];
  categories: { name: string; amount: number; share: number; last30: number; prev30: number; changePct: number | null }[];
  merchants: { title: string; amount: number; count: number }[];
  notes: { tone: 'good' | 'bad' | 'neutral'; text: string }[];
};

const DAY = 86400000;
const amt = (t: Txn) => {
  const n = Number(t.amount);
  return Number.isFinite(n) ? n : 0;
};
const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;
const payee = (t: Txn) => (t.title || '').trim().replace(/\s+/g, ' ');
const payeeKey = (t: Txn) => payee(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+(private limited|pvt ltd|pvt|ltd|limited)\s*$/, '').trim();

/** `today` is YYYY-MM-DD; the 90 days end with it. */
export function overview90(items: Txn[], today: string, nameOf: (t: Txn) => string): Overview {
  const end = Date.parse(`${today}T00:00:00Z`) + DAY; // exclusive
  const start = end - 90 * DAY;
  const from = key(start);
  const to = today;
  const inWindow = items.filter((t) => t.date && t.date >= from && t.date <= to);
  const spends = inWindow.filter((t) => t.type === 'expense');
  const incomes = inWindow.filter((t) => t.type === 'income' || t.type === 'deposit');
  const spent = spends.reduce((s, t) => s + amt(t), 0);
  const income = incomes.reduce((s, t) => s + amt(t), 0);
  const transfers = inWindow.filter((t) => t.type === 'transfer').reduce((s, t) => s + amt(t), 0);

  const months = [2, 1, 0].map((i) => {
    const a = key(end - (i + 1) * 30 * DAY);
    const b = key(end - i * 30 * DAY - DAY);
    const sum = (list: Txn[]) => list.filter((t) => t.date! >= a && t.date! <= b).reduce((s, t) => s + amt(t), 0);
    return { from: a, to: b, spent: sum(spends), income: sum(incomes) };
  });
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const a = key(end - (13 - i) * 7 * DAY);
    const b = key(end - (12 - i) * 7 * DAY - DAY);
    return { from: a, spent: spends.filter((t) => t.date! >= a && t.date! <= b).reduce((s, t) => s + amt(t), 0) };
  });

  const last30From = months[2].from;
  const prev30From = months[1].from;
  const cats = new Map<string, { amount: number; last30: number; prev30: number }>();
  for (const t of spends) {
    const name = nameOf(t);
    const c = cats.get(name) || { amount: 0, last30: 0, prev30: 0 };
    c.amount += amt(t);
    if (t.date! >= last30From) c.last30 += amt(t);
    else if (t.date! >= prev30From) c.prev30 += amt(t);
    cats.set(name, c);
  }
  const categories = [...cats.entries()]
    .map(([name, c]) => ({ name, ...c, share: spent > 0 ? c.amount / spent : 0, changePct: c.prev30 > 0 ? (c.last30 - c.prev30) / c.prev30 : null }))
    .sort((a, b) => b.amount - a.amount);

  const pays = new Map<string, { title: string; amount: number; count: number }>();
  for (const t of spends) {
    const k = payeeKey(t);
    if (!k) continue;
    const m = pays.get(k) || { title: payee(t), amount: 0, count: 0 };
    m.amount += amt(t);
    m.count += 1;
    pays.set(k, m);
  }
  const merchants = [...pays.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);

  // Plain-language notes, most useful first
  const notes: Overview['notes'] = [];
  const [, prev, last] = months;
  if (prev.spent > 0 && last.spent > 0) {
    const change = (last.spent - prev.spent) / prev.spent;
    if (Math.abs(change) >= 0.1) {
      const howMuch = change >= 1 ? `${(last.spent / prev.spent).toFixed(1)}× the 30 days before` : `${pct(change)} ${change > 0 ? 'more' : 'less'} than the 30 days before`;
      notes.push({ tone: change > 0 ? 'bad' : 'good', text: `You spent ${inr(last.spent)} in the last 30 days: ${howMuch}.` });
    } else notes.push({ tone: 'neutral', text: `You spent ${inr(last.spent)} in the last 30 days, about the same as the 30 days before.` });
  }
  const rising = categories.filter((c) => c.changePct !== null && c.changePct >= 0.3 && c.last30 - c.prev30 >= 1000).sort((a, b) => b.last30 - b.prev30 - (a.last30 - a.prev30));
  for (const c of rising.slice(0, 2)) {
    const up = c.changePct! >= 2 ? `${(c.last30 / c.prev30).toFixed(1)}× what it was` : `up ${pct(c.changePct!)}`;
    notes.push({ tone: 'bad', text: `${c.name} is ${up}: ${inr(c.last30)} this month vs ${inr(c.prev30)} before.` });
  }
  const falling = categories.filter((c) => c.changePct !== null && c.changePct <= -0.3 && c.prev30 - c.last30 >= 1000).sort((a, b) => b.prev30 - b.last30 - (a.prev30 - a.last30));
  for (const c of falling.slice(0, 1)) notes.push({ tone: 'good', text: `${c.name} is down ${pct(c.changePct!)}: ${inr(c.last30)} this month vs ${inr(c.prev30)} before.` });
  if (categories[0] && spent > 0) notes.push({ tone: 'neutral', text: `Your biggest spend is ${categories[0].name}: ${inr(categories[0].amount)} (${pct(categories[0].share)} of everything).` });
  if (merchants[0] && merchants[0].count >= 3) notes.push({ tone: 'neutral', text: `Most money went to ${merchants[0].title}: ${inr(merchants[0].amount)} over ${merchants[0].count} payments.` });
  // Weekends vs weekdays, per day
  let we = 0;
  let wd = 0;
  for (const t of spends) {
    const day = new Date(`${t.date}T12:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) we += amt(t);
    else wd += amt(t);
  }
  const wePerDay = we / (90 * 2 / 7);
  const wdPerDay = wd / (90 * 5 / 7);
  if (wdPerDay > 0 && wePerDay > 1.5 * wdPerDay) notes.push({ tone: 'neutral', text: `You spend ${(wePerDay / wdPerDay).toFixed(1)}× more per day on weekends (${inr(wePerDay)} vs ${inr(wdPerDay)}).` });
  if (transfers > 0) notes.push({ tone: 'neutral', text: `${inr(transfers)} went to family or your own accounts; that's not counted as spending.` });

  return { from, to, spent, income, transfers, perDay: spent / 90, months, weeks, categories, merchants, notes };
}
