/** Keys inside planner_settings/budgets_<phone>. */
export const MONTHLY_BUDGET_KEY = 'monthlyBudget';
export const categoryBudgetKey = (category: string) => `cat:${category}`;

export type BudgetStatus = 'ok' | 'warning' | 'over';

export type BudgetSummary = {
  budget: number;
  spent: number;
  left: number;
  /** spent / budget, can exceed 1 */
  used: number;
  status: BudgetStatus;
  /** Whole days remaining in the cycle, including today. */
  daysLeft: number;
  /** What can still be spent per day for the rest of the cycle (0 when over budget). */
  perDay: number;
};

export function budgetStatus(used: number): BudgetStatus {
  if (used > 1) return 'over';
  if (used >= 0.8) return 'warning';
  return 'ok';
}

const DAY = 86_400_000;

export function summarizeBudget(budget: number, spent: number, cycleEnd: Date, now: Date = new Date()): BudgetSummary {
  const used = budget > 0 ? spent / budget : 0;
  const left = budget - spent;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysLeft = Math.max(1, Math.ceil((cycleEnd.getTime() - startOfToday) / DAY));
  return {
    budget,
    spent,
    left,
    used,
    status: budgetStatus(used),
    daysLeft,
    perDay: left > 0 ? Math.floor(left / daysLeft) : 0,
  };
}

/** Category name -> limit, read from the stored budgets doc. */
export function categoryBudgets(stored: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stored || {})) {
    if (k.startsWith('cat:') && Number(v) > 0) out[k.slice(4)] = Number(v);
  }
  return out;
}
