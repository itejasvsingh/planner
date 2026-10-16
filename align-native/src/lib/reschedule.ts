/**
 * "Move to…" choices for a task: tomorrow, the coming Saturday, next Monday (and today, for something overdue).
 * Pure (dates as YYYY-MM-DD keys), tested in tests/reschedule.test.cjs.
 */
export type MoveOption = { label: string; key: string };

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const plus = (k: string, days: number) => {
  const d = parse(k);
  d.setDate(d.getDate() + days);
  return keyOf(d);
};

export function moveOptions(today: string, currentDue: string | null | undefined): MoveOption[] {
  const dow = parse(today).getDay(); // 0 = Sunday
  const tomorrow = plus(today, 1);
  const saturday = plus(today, ((6 - dow + 7) % 7) || 7); // the coming Saturday (a week away when today is Saturday)
  const monday = plus(today, ((1 - dow + 7) % 7) || 7); // the coming Monday
  const all: MoveOption[] = [
    ...(currentDue && currentDue < today ? [{ label: 'Today', key: today }] : []),
    { label: 'Tomorrow', key: tomorrow },
    { label: 'This weekend', key: saturday },
    { label: 'Next week', key: monday },
  ];
  // One choice per day, and never the day it's already on
  const seen = new Set<string>();
  return all.filter(o => {
    if (o.key === currentDue || seen.has(o.key)) return false;
    seen.add(o.key);
    return true;
  });
}
