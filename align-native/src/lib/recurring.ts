/**
 * Which monthly bills to auto-add for the current month. Pure (no imports) so tests can load it directly
 * (see tests/recurring.test.cjs).
 */

export type RecurringItem = {
  id: string;
  type?: string;
  title?: string;
  amount?: number | string | null;
  date?: string | null;
  category?: string;
  tags?: string[];
  isRecurring?: boolean;
  isGeneratedRecurring?: boolean;
  recurringParentId?: string;
  recurringFrequency?: 'monthly' | 'weekly' | 'yearly';
};

export type GeneratedBill = {
  type: 'expense';
  title?: string;
  amount: number | string;
  date: string;
  category: string;
  tags: string[];
  splits: [];
  isRecurring: true;
  isGeneratedRecurring: true;
  recurringParentId: string;
  recurringFrequency: 'monthly' | 'weekly' | 'yearly';
};

const pad = (n: number) => String(n).padStart(2, '0');
const sameBill = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/**
 * One generated copy per bill per month. A bill is identified by its title, so logging rent by hand every
 * month with "Monthly bill" on does not make every past entry spawn its own copy, and a bill already paid
 * this month (added by hand or generated earlier) is never added again.
 */
export function billsToGenerate(items: RecurringItem[], now: Date = new Date()): GeneratedBill[] {
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const todayKey = `${monthKey}-${pad(now.getDate())}`;
  const expenses = items.filter(it => it.type === 'expense');
  const thisMonth = expenses.filter(it => (it.date || '').startsWith(monthKey));

  // Latest template per bill title.
  const latest = new Map<string, RecurringItem>();
  for (const it of expenses) {
    if (!it.isRecurring || it.isGeneratedRecurring || (it.recurringFrequency && it.recurringFrequency !== 'monthly')) continue;
    const k = (it.title || '').trim().toLowerCase();
    const prev = latest.get(k);
    if (!prev || (it.date || '') > (prev.date || '')) latest.set(k, it);
  }

  const out: GeneratedBill[] = [];
  for (const rec of latest.values()) {
    const paid = thisMonth.some(it => it.id === rec.id || it.recurringParentId === rec.id || (it.isRecurring && sameBill(it.title, rec.title)));
    if (paid) continue;
    const day = (rec.date || '').length >= 10 ? (rec.date as string).slice(8, 10) : '01';
    // Clamp to the month's length (a bill on the 31st lands on the 30th in a 30-day month).
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const billDate = `${monthKey}-${pad(Math.min(Number(day) || 1, lastDay))}`;
    out.push({
      type: 'expense',
      title: rec.title,
      amount: rec.amount ?? 0,
      // Bills due later this month show up on the 1st so they count towards this month's plan.
      date: billDate <= todayKey ? billDate : `${monthKey}-01`,
      category: rec.category || '#Bills',
      tags: rec.tags || ['#Bills'],
      splits: [],
      isRecurring: true,
      isGeneratedRecurring: true,
      recurringParentId: rec.id,
      recurringFrequency: 'monthly',
    });
  }
  return out;
}
