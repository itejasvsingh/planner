import { amountOf, cycleRange, dateKey, inRange, isExpense, isIncome, type Txn } from './finance-analysis';

/** What the Android home-screen widget shows. Plain numbers and short strings: stored on the phone, never sent anywhere. */
export type WidgetSnapshot = {
  updated: number;
  /** Open tasks due today, and how many open tasks are overdue. */
  todayCount: number;
  overdue: number;
  /** Up to three of today's open tasks, timed ones first. */
  next: { title: string; time: string }[];
  /** Income less spending this salary cycle; null when nothing is logged yet. */
  left: number | null;
  spentToday: number;
};

type Item = Txn & { done?: boolean; dueDate?: string | null; dueTime?: string | null; reminderTime?: string | null };

export function buildWidgetSnapshot(items: Item[], payday: number, now: Date = new Date()): WidgetSnapshot {
  const today = dateKey(now);
  const open = items.filter(i => i.type === 'task' && !i.done && i.dueDate);
  const dueToday = open.filter(i => i.dueDate === today);
  const timeOf = (i: Item) => i.reminderTime || i.dueTime || '';
  const next = [...dueToday]
    .sort((a, b) => (timeOf(a) || '99:99').localeCompare(timeOf(b) || '99:99') || String(a.title).localeCompare(String(b.title)))
    .slice(0, 3)
    .map(i => ({ title: String(i.title || 'Task'), time: timeOf(i) }));

  const cycle = cycleRange(payday, 0, now);
  const inCycle = items.filter(i => inRange(i, cycle.startKey, cycle.endKey));
  let income = 0;
  let spent = 0;
  for (const i of inCycle) {
    if (isExpense(i)) spent += amountOf(i);
    else if (isIncome(i)) income += amountOf(i);
  }
  const spentToday = items.filter(i => isExpense(i) && i.date === today).reduce((s, i) => s + amountOf(i), 0);

  return {
    updated: now.getTime(),
    todayCount: dueToday.length,
    overdue: open.filter(i => String(i.dueDate) < today).length,
    next,
    left: income > 0 || spent > 0 ? income - spent : null,
    spentToday,
  };
}
