/**
 * Plain-code reading of a forwarded announcement ("Date: 15th October, 2026 / Time: 1:50 PM / Topic: ..."), used when
 * the AI is unavailable so a long message still becomes one task with the right day, time and purpose.
 */
export type Announcement = { title: string; dueDate: string | null; dueTime: string | null; reminderTime: string | null };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const pad = (n: number) => String(n).padStart(2, '0');

function dateIn(text: string, today: string): string | null {
  const [ty, tm, td] = today.split('-').map(Number);
  const found: { month: number; day: number; year?: number; at: number }[] = [];
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b\\.?,?\\s*(\\d{4})?`, 'gi');
  const monthFirst = new RegExp(`\\b${MONTH}\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(\\d{4})?`, 'gi');
  for (const m of text.matchAll(dayFirst)) found.push({ day: +m[1], month: MONTHS[m[2].slice(0, 3).toLowerCase()], year: m[3] ? +m[3] : undefined, at: m.index || 0 });
  for (const m of text.matchAll(monthFirst)) found.push({ day: +m[2], month: MONTHS[m[1].slice(0, 3).toLowerCase()], year: m[3] ? +m[3] : undefined, at: m.index || 0 });
  const valid = found.filter(f => f.day >= 1 && f.day <= 31 && f.month).sort((a, b) => a.at - b.at);
  // "Date: ..." wins over any other date in the message (deadlines in the small print)
  const labelled = text.search(/\bdate\s*[:\-–]/i);
  const pick = (labelled >= 0 && valid.find(f => f.at >= labelled)) || valid[0];
  if (!pick) return null;
  let year = pick.year ?? ty;
  // No year given and that day has already passed: it means next year
  if (!pick.year && (pick.month < tm || (pick.month === tm && pick.day < td))) year += 1;
  return `${year}-${pad(pick.month)}-${pad(pick.day)}`;
}

function toHHmm(h: string, m: string | undefined, mer: string | undefined): string | null {
  let hour = parseInt(h, 10);
  const min = m ? parseInt(m, 10) : 0;
  if (!Number.isFinite(hour) || min > 59) return null;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    if (/pm/i.test(mer) && hour < 12) hour += 12;
    if (/am/i.test(mer) && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return `${pad(hour)}:${pad(min)}`;
}

const TIME = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)';

function timeIn(text: string): string | null {
  const labelled = text.match(new RegExp(`\\btime\\s*[:\\-–]\\s*\\**\\s*${TIME}`, 'i')) || text.match(new RegExp(`\\b(?:begins?|starts?|commences?)[^.\\n]{0,25}?${TIME}`, 'i')) || text.match(new RegExp(`\\b${TIME}`, 'i'));
  return labelled ? toHHmm(labelled[1], labelled[2], labelled[3]) : null;
}

/** "Attendance will be taken at 1:40 PM": be there before the start, so remind then. */
function reminderIn(text: string, start: string | null): string | null {
  const m = text.match(new RegExp(`\\b(?:attendance|report(?:ing)?|reach|arrive|be there|gather|check[- ]in|reporting)\\b[^.\\n]{0,50}?\\b(?:at|by|before)\\s+${TIME}`, 'i'));
  const t = m ? toHHmm(m[1], m[2], m[3]) : null;
  return t && start && t < start ? t : null;
}

const strip = (s: string) => s.replace(/[*_~`]/g, '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

function titleIn(text: string): string {
  const topic = text.match(/^[^\S\n]*[^\w\n]*\**\s*(?:topic|subject|event|agenda|title)\s*\**\s*[:\-–]\s*(.+)$/im);
  const first = text.split('\n').map(strip).find(l => l.length > 2) || 'Event';
  const body = strip(topic ? topic[1] : first);
  const noun = text.match(/\b(lecture|webinar|seminar|workshop|meeting|exam|interview|session|class|viva|presentation)\b/i)?.[1];
  const label = noun && !new RegExp(noun, 'i').test(body) ? `${noun[0].toUpperCase()}${noun.slice(1).toLowerCase()}: ` : '';
  const out = `${label}${body}`;
  return out.length > 80 ? `${out.slice(0, 77).trimEnd()}…` : out;
}

export function parseAnnouncement(text: string, today: string): Announcement {
  const dueDate = dateIn(text, today);
  const dueTime = timeIn(text);
  return { title: titleIn(text), dueDate, dueTime, reminderTime: reminderIn(text, dueTime) };
}
