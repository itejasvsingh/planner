export function pad(n: number | string) {
  return String(n).padStart(2, '0');
}

export function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map((part) => parseInt(part, 10));
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(d: Date) {
  const next = new Date(d);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(0, 0, 0, 0);
  return next;
}

export function timeToMinutes(timeStr: string | null | undefined) {
  if (!timeStr) return null;
  const normalized = timeStr.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (minutes > 59 || hours > 23 || (match[3] && hours > 12)) return null;
  if (match[3] === 'AM' && hours === 12) hours = 0;
  if (match[3] === 'PM' && hours !== 12) hours += 12;
  return hours * 60 + minutes;
}

export function todayKey() {
  return formatDateKey(new Date());
}
