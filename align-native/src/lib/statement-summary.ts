/**
 * A plain summary of one statement Align read: what went out and came in between its first and last date on that
 * card or account, the biggest categories and shops, the largest spend, and the change from the previous statement
 * of the same card/account. Rules only (no AI). Pure (no imports), tested in tests/statement-summary.test.cjs.
 */
export type StatementRecord = {
  id: string; bankId: string; bankName: string; kind: 'account' | 'card'; last4: string | null; product?: string | null;
  state: 'ok' | 'unreadable'; from?: string | null; to?: string | null; rows?: number; added?: number; at: number;
};
type Item = {
  id: string; type?: string; title?: string; amount?: number | string | null; date?: string | null; category?: string;
  cardLast4?: string | null; accountLast4?: string | null; excluded?: boolean;
};
export type Ranked = { name: string; total: number; count: number };
export type StatementSummary = {
  spent: number; received: number; count: number;
  categories: Ranked[]; shops: Ranked[];
  biggest: { title: string; amount: number; date: string } | null;
  /** Spent vs the previous statement of the same card/account (fraction, e.g. 0.12 = 12% more); null without one. */
  change: number | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The transactions a statement covers: same card (or account) number, from its first to its last date. */
export function statementItems<T extends Item>(items: T[], rec: StatementRecord): T[] {
  if (!rec.last4 || !rec.from || !rec.to) return [];
  const field = rec.kind === 'card' ? 'cardLast4' : 'accountLast4';
  return items.filter(t => t[field] === rec.last4 && !!t.date && t.date >= rec.from! && t.date <= rec.to!);
}

const rank = (map: Map<string, Ranked>, n = 3) => [...map.values()].sort((a, b) => b.total - a.total).slice(0, n).map(r => ({ ...r, total: r2(r.total) }));

export function summarizeStatement(items: Item[], rec: StatementRecord, previous?: StatementRecord | null): StatementSummary {
  const mine = statementItems(items, rec);
  let spent = 0;
  let received = 0;
  let count = 0;
  let biggest: StatementSummary['biggest'] = null;
  const cats = new Map<string, Ranked>();
  const shops = new Map<string, Ranked>();
  for (const t of mine) {
    if (t.excluded) continue;
    const a = num(t.amount);
    if (t.type === 'income') { received += a; continue; }
    if (t.type !== 'expense') continue;
    spent += a;
    count += 1;
    const cat = t.category || 'Other';
    const c = cats.get(cat) || { name: cat, total: 0, count: 0 };
    c.total += a; c.count += 1; cats.set(cat, c);
    const title = (t.title || 'Expense').trim();
    const key = title.toLowerCase();
    const s = shops.get(key) || { name: title, total: 0, count: 0 };
    s.total += a; s.count += 1; shops.set(key, s);
    if (!biggest || a > biggest.amount) biggest = { title, amount: a, date: t.date || '' };
  }
  let change: number | null = null;
  if (previous) {
    const before = statementItems(items, previous).filter(t => t.type === 'expense' && !t.excluded).reduce((s, t) => s + num(t.amount), 0);
    if (before > 0) change = Math.round(((spent - before) / before) * 100) / 100;
  }
  return { spent: r2(spent), received: r2(received), count, categories: rank(cats), shops: rank(shops), biggest, change };
}

/** The statement before `rec` for the same bank, kind and card/account number. */
export function previousStatement(all: StatementRecord[], rec: StatementRecord): StatementRecord | null {
  return all
    .filter(r => r.id !== rec.id && r.state === 'ok' && r.bankId === rec.bankId && r.kind === rec.kind && r.last4 === rec.last4 && (r.to || '') < (rec.from || ''))
    .sort((a, b) => (b.to || '').localeCompare(a.to || ''))[0] || null;
}
