import type { PlannerItem } from '@/lib/planner-item';

/**
 * "Auto-push tasks": undone tasks from earlier days move to today. The server does it at midnight (India);
 * the app does it too whenever it's open, so overdue tasks never sit in the past waiting for the server.
 * Card bills keep their due date, since moving one would hide that it's overdue.
 */
export function overdueTasks(items: PlannerItem[], todayKey: string): { id: string; from: string }[] {
  const out: { id: string; from: string }[] = [];
  for (const i of items) {
    if (i.type !== 'task' || i.done || i.kind === 'card_bill') continue;
    const due = i.dueDate || i.date;
    if (due && due < todayKey) out.push({ id: i.id, from: due });
  }
  return out;
}
