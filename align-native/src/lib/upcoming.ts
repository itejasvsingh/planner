/**
 * "Coming up": the next bills and card dues in the coming days. Pure (no imports), tested in tests/upcoming.test.cjs.
 * Monthly/weekly/yearly bills come from your recurring expenses; card dues come in already worked out by the caller
 * (what's owed now), so a card isn't listed twice via its reminder task.
 */
export type RecurringParent = {
  id: string;
  type?: string;
  title?: string;
  amount?: number | string | null;
  date?: string | null;
  isRecurring?: boolean;
  isGeneratedRecurring?: boolean;
  recurringParentId?: string;
  recurringFrequency?: 'monthly' | 'weekly' | 'yearly';
};
export type CardDue = { title: string; dueDate: string | null; outstanding: number; hidden?: boolean; status?: string };
export type Upcoming = { key: string; date: string; title: string; amount: number; kind: 'bill' | 'card' };

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
// A 31st bill falls on the last day of a shorter month
const clamp = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));

/** The first date on or after `from` that this recurring bill falls on. */
export function nextDue(startKey: string, freq: string | undefined, from: Date): Date {
  const start = parse(startKey);
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (start >= f) return start;
  if (freq === 'weekly') {
    const diff = Math.ceil((f.getTime() - start.getTime()) / 86_400_000);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.ceil(diff / 7) * 7);
  }
  if (freq === 'yearly') {
    const t = clamp(f.getFullYear(), start.getMonth(), start.getDate());
    return t >= f ? t : clamp(f.getFullYear() + 1, start.getMonth(), start.getDate());
  }
  const t = clamp(f.getFullYear(), f.getMonth(), start.getDate());
  return t >= f ? t : clamp(f.getFullYear(), f.getMonth() + 1, start.getDate());
}

export function upcomingPayments(items: RecurringParent[], cards: CardDue[], now: Date = new Date(), days = 14): Upcoming[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = key(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
  const today = key(from);
  const out: Upcoming[] = [];
  const have = new Set(items.filter(i => i.recurringParentId && i.date).map(i => `${i.recurringParentId}|${i.date}`));

  for (const p of items) {
    if (!p.isRecurring || p.isGeneratedRecurring || p.type !== 'expense' || !p.date) continue;
    const d = key(nextDue(p.date, p.recurringFrequency, from));
    // Already added as a real expense for that day: it shows in your list, not here
    if (d > to || have.has(`${p.id}|${d}`)) continue;
    out.push({ key: `bill-${p.id}-${d}`, date: d, title: p.title || 'Bill', amount: Number(p.amount) || 0, kind: 'bill' });
  }
  for (const c of cards) {
    if (c.hidden || c.status === 'paid' || !c.dueDate || c.outstanding <= 0 || c.dueDate < today || c.dueDate > to) continue;
    out.push({ key: `card-${c.title}-${c.dueDate}`, date: c.dueDate, title: `${c.title} bill`, amount: c.outstanding, kind: 'card' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}
