/**
 * Pure money math for the Money tab: salary-cycle ranges, period summaries, breakdowns, trends and
 * plain-language insights. No imports, so tests can load it directly (see tests/finance-analysis.test.cjs).
 */

export type Txn = {
  id: string;
  type?: string;
  title?: string;
  amount?: number | string | null;
  date?: string | null;
  category?: string;
  isRecurring?: boolean;
};

export type Cycle = {
  start: Date;
  /** Exclusive: first day of the next cycle. */
  end: Date;
  startKey: string;
  endKey: string;
  /** Number of days in the cycle. */
  days: number;
};

const DAY = 86_400_000;

/** Local calendar date as YYYY-MM-DD (never toISOString, which shifts the day east of UTC). */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Payday clamped to the month's length, so a 31st payday lands on Feb 28/29. */
function paydayIn(year: number, month: number, payday: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, payday), last));
}

/** The salary cycle containing `now`, shifted by `offset` cycles (-1 = previous cycle). */
export function cycleRange(payday: number, offset = 0, now: Date = new Date()): Cycle {
  const year = now.getFullYear();
  let month = now.getMonth();
  if (now.getDate() < paydayIn(year, month, payday).getDate()) month -= 1;
  month += offset;
  const start = paydayIn(year, month, payday);
  const end = paydayIn(start.getFullYear(), start.getMonth() + 1, payday);
  return {
    start,
    end,
    startKey: dateKey(start),
    endKey: dateKey(end),
    days: Math.round((end.getTime() - start.getTime()) / DAY),
  };
}

export const amountOf = (t: Txn) => {
  const n = Number(t.amount);
  return Number.isFinite(n) ? n : 0;
};
export const isExpense = (t: Txn) => t.type === 'expense';
export const isIncome = (t: Txn) => t.type === 'income' || t.type === 'deposit';
export const isMoney = (t: Txn) => isExpense(t) || isIncome(t) || t.type === 'transfer';

export function inRange(t: Txn, startKey: string, endKey: string): boolean {
  const d = t.date || '';
  return d >= startKey && d < endKey;
}

export type Summary = {
  spent: number;
  income: number;
  net: number;
  /** Share of income kept (0..1), null without income. */
  savingsRate: number | null;
  expenseCount: number;
};

export function summarize(txns: Txn[]): Summary {
  let spent = 0;
  let income = 0;
  let expenseCount = 0;
  for (const t of txns) {
    if (isExpense(t)) {
      spent += amountOf(t);
      expenseCount += 1;
    } else if (isIncome(t)) income += amountOf(t);
  }
  const net = income - spent;
  return { spent, income, net, savingsRate: income > 0 ? net / income : null, expenseCount };
}

export type CategoryTotal = { name: string; amount: number; count: number; share: number };

/** Expense totals per category name (as resolved by `nameOf`), largest first. */
export function byCategory(txns: Txn[], nameOf: (t: Txn) => string): CategoryTotal[] {
  const map = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const t of txns) {
    if (!isExpense(t)) continue;
    const name = nameOf(t);
    const cur = map.get(name) || { amount: 0, count: 0 };
    cur.amount += amountOf(t);
    cur.count += 1;
    map.set(name, cur);
    total += amountOf(t);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, share: total > 0 ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Change of each current category against the previous period (missing previous = 0). */
export function categoryChanges(current: CategoryTotal[], previous: CategoryTotal[]) {
  const prev = new Map(previous.map(p => [p.name, p.amount]));
  return current.map(c => {
    const before = prev.get(c.name) || 0;
    return { name: c.name, current: c.amount, previous: before, change: c.amount - before, changePct: before > 0 ? (c.amount - before) / before : null };
  });
}

/** Spending per day across [start, end), including zero days. */
export function dailySeries(txns: Txn[], cycle: Pick<Cycle, 'start' | 'end'>): { key: string; date: Date; amount: number }[] {
  const totals = new Map<string, number>();
  for (const t of txns) if (isExpense(t) && t.date) totals.set(t.date, (totals.get(t.date) || 0) + amountOf(t));
  const out: { key: string; date: Date; amount: number }[] = [];
  for (let d = new Date(cycle.start); d < cycle.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = dateKey(d);
    out.push({ key, date: d, amount: totals.get(key) || 0 });
  }
  return out;
}

/** Total spend per weekday, Sunday = 0. */
export function weekdayTotals(txns: Txn[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const t of txns) {
    if (!isExpense(t) || !t.date) continue;
    const [y, m, d] = t.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    out[new Date(y, m - 1, d).getDay()] += amountOf(t);
  }
  return out;
}

export function topExpenses(txns: Txn[], n = 5): Txn[] {
  return txns.filter(isExpense).sort((a, b) => amountOf(b) - amountOf(a)).slice(0, n);
}

/** Spent and income for the last `count` cycles ending at the cycle `offset`, oldest first. */
export function cycleTrend(txns: Txn[], payday: number, count = 6, offset = 0, now: Date = new Date()) {
  const out: { cycle: Cycle; spent: number; income: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const cycle = cycleRange(payday, offset - i, now);
    const s = summarize(txns.filter(t => inRange(t, cycle.startKey, cycle.endKey)));
    out.push({ cycle, spent: s.spent, income: s.income });
  }
  return out;
}

/** Days of the cycle elapsed up to and including today (the whole cycle when it is over). */
export function elapsedDays(cycle: Cycle, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today >= cycle.end) return cycle.days;
  if (today < cycle.start) return 0;
  return Math.round((today.getTime() - cycle.start.getTime()) / DAY) + 1;
}

export type Pace = {
  /** Everyday (non-recurring) spending per elapsed day. */
  perDay: number;
  /** Recurring bills in the period, counted once rather than spread over the days. */
  recurring: number;
  /** recurring + perDay × days in the cycle. */
  projected: number;
  elapsed: number;
};

/** Daily pace that doesn't let rent paid on day 1 look like a daily habit. */
export function pace(current: Txn[], cycle: Cycle, now: Date = new Date()): Pace {
  const elapsed = Math.max(1, elapsedDays(cycle, now));
  let recurring = 0;
  let everyday = 0;
  for (const t of current) {
    if (!isExpense(t)) continue;
    if (t.isRecurring) recurring += amountOf(t);
    else everyday += amountOf(t);
  }
  const perDay = everyday / elapsed;
  return { perDay, recurring, projected: Math.round(recurring + perDay * cycle.days), elapsed };
}

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export type Insight = { tone: 'good' | 'bad' | 'neutral'; text: string };

/**
 * Short, factual observations about a period. `previousToDate` must cover the same number of days
 * as `current` so an in-progress cycle is compared fairly with the same stretch of the last one.
 */
export function buildInsights(input: {
  current: Txn[];
  previousToDate: Txn[];
  nameOf: (t: Txn) => string;
  cycle: Cycle;
  inProgress: boolean;
  now?: Date;
  format: (n: number) => string;
}): Insight[] {
  const { current, previousToDate, nameOf, cycle, inProgress, format } = input;
  const out: Insight[] = [];
  const cur = summarize(current);
  const prev = summarize(previousToDate);
  if (cur.expenseCount === 0) return out;

  if (prev.spent > 0) {
    const pct = Math.round(((cur.spent - prev.spent) / prev.spent) * 100);
    const span = inProgress ? 'than at this point last cycle' : 'than last cycle';
    if (pct <= -5) out.push({ tone: 'good', text: `You've spent ${Math.abs(pct)}% less ${span}.` });
    else if (pct >= 5) out.push({ tone: 'bad', text: `You've spent ${pct}% more ${span}.` });
    else out.push({ tone: 'neutral', text: `Spending is level with last cycle.` });
  }

  const cats = byCategory(current, nameOf);
  if (cats[0] && cats[0].share >= 0.25 && cats.length > 1) {
    out.push({ tone: 'neutral', text: `${cats[0].name} is ${Math.round(cats[0].share * 100)}% of your spending.` });
  }

  const rises = categoryChanges(cats, byCategory(previousToDate, nameOf))
    .filter(c => c.previous > 0 && c.change > 0 && c.changePct !== null && c.changePct >= 0.25 && c.change >= cur.spent * 0.05)
    .sort((a, b) => b.change - a.change);
  if (rises[0]) {
    out.push({ tone: 'bad', text: `${rises[0].name} is up ${format(rises[0].change)} (${Math.round((rises[0].changePct || 0) * 100)}%).` });
  }

  if (inProgress) {
    const p = pace(current, cycle, input.now);
    if (p.elapsed >= 3 && p.elapsed < cycle.days) {
      out.push({ tone: 'neutral', text: `At this pace you'll spend about ${format(p.projected)} this cycle (${format(Math.round(p.perDay))}/day plus bills).` });
    }
  }

  if (cur.expenseCount >= 5) {
    const wd = weekdayTotals(current);
    const max = Math.max(...wd);
    const total = wd.reduce((a, b) => a + b, 0);
    if (total > 0 && max / total >= 0.25) out.push({ tone: 'neutral', text: `You spend the most on ${WEEKDAYS[wd.indexOf(max)]}.` });
  }

  const recurring = current.filter(t => isExpense(t) && t.isRecurring).reduce((s, t) => s + amountOf(t), 0);
  if (recurring > 0) out.push({ tone: 'neutral', text: `${format(recurring)} went to recurring bills.` });

  if (cur.savingsRate !== null) {
    const pct = Math.round(cur.savingsRate * 100);
    out.push(pct >= 0
      ? { tone: pct >= 20 ? 'good' : 'neutral', text: `You kept ${pct}% of your income.` }
      : { tone: 'bad', text: `You spent ${format(Math.abs(cur.net))} more than you earned.` });
  }
  return out;
}
