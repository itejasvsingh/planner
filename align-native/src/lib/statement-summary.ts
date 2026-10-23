/**
 * A plain summary of one statement Align read: what went out and came in between its first and last date on that
 * card or account, the biggest categories and shops, the largest spend, and the change from the previous statement
 * of the same card/account. Rules only (no AI). Pure (no imports), tested in tests/statement-summary.test.cjs.
 */
export type StatementRecord = {
  id: string; bankId: string; bankName: string; kind: 'account' | 'card'; last4: string | null; product?: string | null;
  state: 'ok' | 'unreadable'; from?: string | null; to?: string | null; rows?: number; added?: number; at: number;
  billFound?: boolean; bill?: { totalDue: number; minDue: number | null; dueDate: string } | null;
  /** The statement's own summary: previous balance, payments received, purchases, finance charges (kept only when they add up). */
  breakdown?: { previous?: number; payments?: number; purchases?: number; charges?: number } | null;
};
type Item = {
  id: string; type?: string; title?: string; amount?: number | string | null; date?: string | null; category?: string;
  cardLast4?: string | null; accountLast4?: string | null; excluded?: boolean;
};
export type Ranked = { name: string; total: number; count: number };
export type StatementRow = { id: string; date: string; title: string; amount: number; kind: 'spend' | 'refund' | 'fee'; category?: string };
export type StatementSummary = {
  spent: number; /** Refunds and credits back to the card/account */ received: number; refunds: number; /** Interest, late fees, GST and other charges */ fees: number; /** Money sent to family or your own accounts: out of the account, but not spending */ transfers: number; count: number;
  categories: Ranked[]; shops: Ranked[];
  biggest: { title: string; amount: number; date: string } | null;
  /** Spent vs the previous statement of the same card/account (fraction, e.g. 0.12 = 12% more); null without one. */
  change: number | null;
};

// Interest, late fees, annual/joining fees, GST on them and similar charges: money out, but not spending
const FEE = /finance charge|interest|late (?:payment )?(?:fee|charge)|annual fee|joining fee|membership fee|\bgst\b|igst|cgst|sgst|service tax|over ?limit|surcharge|processing fee|cash advance fee|forex mark ?up|\bfee\b/i;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The transactions a statement covers: same card (or account) number, from its first to its last date. */
export function statementItems<T extends Item>(items: T[], rec: StatementRecord): T[] {
  if (!rec.last4 || !rec.from || !rec.to) return [];
  // A card: its card number. A bank account: its account number (or "Paid with" naming it)
  const mine = (t: Item) => (rec.kind === 'card' ? t.cardLast4 === rec.last4 : t.accountLast4 === rec.last4 || t.cardLast4 === rec.last4);
  return items.filter(t => mine(t) && !!t.date && t.date >= rec.from! && t.date <= rec.to!);
}

const rank = (map: Map<string, Ranked>, n = 3) => [...map.values()].sort((a, b) => b.total - a.total).slice(0, n).map(r => ({ ...r, total: r2(r.total) }));

/** Every transaction on the statement: spends, refunds and fees, newest first. */
export function statementRows(items: Item[], rec: StatementRecord): StatementRow[] {
  const out: StatementRow[] = [];
  for (const t of statementItems(items, rec)) {
    if (t.excluded || (t.type !== 'expense' && t.type !== 'income')) continue;
    const title = (t.title || (t.type === 'income' ? 'Credit' : 'Expense')).trim();
    out.push({ id: t.id, date: t.date || '', title, amount: num(t.amount), kind: t.type === 'income' ? 'refund' : FEE.test(title) ? 'fee' : 'spend', ...(t.category ? { category: t.category } : {}) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeStatement(items: Item[], rec: StatementRecord, previous?: StatementRecord | null): StatementSummary {
  const mine = statementItems(items, rec);
  let spent = 0;
  let received = 0;
  let fees = 0;
  let transfers = 0;
  let count = 0;
  let biggest: StatementSummary['biggest'] = null;
  const cats = new Map<string, Ranked>();
  const shops = new Map<string, Ranked>();
  for (const t of mine) {
    if (t.excluded) continue;
    const a = num(t.amount);
    if (t.type === 'income') { received += a; continue; }
    if (t.type === 'transfer') { transfers += a; continue; }
    if (t.type !== 'expense') continue;
    if (FEE.test(t.title || '')) { fees += a; continue; }
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
    const before = statementItems(items, previous).filter(t => t.type === 'expense' && !t.excluded && !FEE.test(t.title || '')).reduce((s, t) => s + num(t.amount), 0);
    if (before > 0) change = Math.round(((spent - before) / before) * 100) / 100;
  }
  return { spent: r2(spent), received: r2(received), refunds: r2(received), fees: r2(fees), transfers: r2(transfers), count, categories: rank(cats), shops: rank(shops), biggest, change };
}

/** The statement before `rec` for the same bank, kind and card/account number. */
export function previousStatement(all: StatementRecord[], rec: StatementRecord): StatementRecord | null {
  return all
    .filter(r => r.id !== rec.id && r.state === 'ok' && r.bankId === rec.bankId && r.kind === rec.kind && r.last4 === rec.last4 && (r.to || '') < (rec.from || ''))
    .sort((a, b) => (b.to || '').localeCompare(a.to || ''))[0] || null;
}
