/**
 * "Coming up": the next bills in the coming days and every card due. Pure (no imports), tested in tests/upcoming.test.cjs.
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
/** How urgent a due date is: overdue (red), within 3 days (amber), later (blue). Paid things are green wherever they're shown. */
export type DueTone = 'overdue' | 'soon' | 'later';
export type Upcoming = { key: string; date: string; title: string; amount: number; kind: 'bill' | 'card'; tone: DueTone };

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
// A 31st bill falls on the last day of a shorter month
const clamp = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));

/** Overdue before today, "soon" today through 3 days ahead, else "later". */
export function dueTone(dateKey: string, now: Date = new Date()): DueTone {
  const today = key(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  if (dateKey < today) return 'overdue';
  const days = Math.round((parse(dateKey).getTime() - parse(today).getTime()) / 86_400_000);
  return days <= 3 ? 'soon' : 'later';
}

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
    out.push({ key: `bill-${p.id}-${d}`, date: d, title: p.title || 'Bill', amount: Number(p.amount) || 0, kind: 'bill', tone: dueTone(d, now) });
  }
  // Every credit card with something to pay, whenever it's due (overdue ones first): not just the next two weeks
  for (const c of cards) {
    if (c.hidden || c.status === 'paid' || !c.dueDate || c.outstanding <= 0) continue;
    out.push({ key: `card-${c.title}-${c.dueDate}`, date: c.dueDate, title: `${c.title} bill`, amount: c.outstanding, kind: 'card', tone: dueTone(c.dueDate, now) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/** "Today", "Tomorrow", or "Tue 20 Oct" for a YYYY-MM-DD key. */
export function dueLabel(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Every bill and card due that falls between two days (inclusive), for the calendar: a monthly bill shows each month,
 * a weekly one each week. Bills already added as a real expense for a day are left out (they're in your list then).
 * Card dues are included even when overdue.
 */
export function paymentsBetween(items: RecurringParent[], cards: CardDue[], fromKey: string, toKey: string): Upcoming[] {
  const out: Upcoming[] = [];
  const have = new Set(items.filter(i => i.recurringParentId && i.date).map(i => `${i.recurringParentId}|${i.date}`));
  const from = parse(fromKey);
  for (const p of items) {
    if (!p.isRecurring || p.isGeneratedRecurring || p.type !== 'expense' || !p.date) continue;
    let d = nextDue(p.date, p.recurringFrequency, from);
    for (let n = 0; n < 62; n++) {
      const dk = key(d);
      if (dk > toKey) break;
      if (!have.has(`${p.id}|${dk}`)) out.push({ key: `bill-${p.id}-${dk}`, date: dk, title: p.title || 'Bill', amount: Number(p.amount) || 0, kind: 'bill', tone: dueTone(dk) });
      d = nextDue(p.date, p.recurringFrequency, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    }
  }
  for (const c of cards) {
    if (c.hidden || c.status === 'paid' || !c.dueDate || c.outstanding <= 0 || c.dueDate < fromKey || c.dueDate > toKey) continue;
    out.push({ key: `card-${c.title}-${c.dueDate}`, date: c.dueDate, title: `${c.title} bill`, amount: c.outstanding, kind: 'card', tone: dueTone(c.dueDate) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}
