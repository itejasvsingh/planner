/**
 * Your class timetable from the q567 planner (its Firebase project `q567mba`), as plain data for Align.
 * Pure: no network, no Firebase. The same rules the q567 app uses to build a day from the Google-Sheet schedule
 * (`schedule/daily`), the shared updates (`schedule_changes`), your chosen electives and the sessions you hid.
 * Only course info lives here: no names, rolls or attendance.
 */
export type Q567Subject = { code: string; name: string; room?: string; instructor?: string; isCore?: boolean };

export type Q567Class = {
  /** YYYY-MM-DD (India). */
  date: string;
  /** HH:mm, 24-hour. */
  start: string;
  end: string;
  code: string;
  title: string;
  room: string | null;
  instructor: string | null;
  kind: 'class' | 'icrc';
  /** `moved`: this class was moved to this day from another; `cancelled` also covers "moved away from this day". */
  status: 'ok' | 'cancelled' | 'moved' | 'retimed';
  note: string | null;
};

// Update these each term (copy the term's subjects from q567's data.js; no student data).
export const Q6_SUBJECTS: Q567Subject[] = [
  { code: 'MS6210', name: 'Business Models', room: '401', instructor: 'LPS', isCore: true },
  { code: 'MS5529', name: 'Behavioural lab', room: '401', instructor: 'Lata Dyaram', isCore: true },
  { code: 'MS5015', name: 'Design Thinking', room: '252', instructor: 'Richa Agrawal' },
  { code: 'MS6580', name: 'Sales and Distribution Management', room: '252', instructor: 'Prathamesh Kittur' },
  { code: 'MS5460', name: 'Compensation Management', room: '253', instructor: 'Srinivasan S' },
  { code: 'MS5690', name: 'Computational Finance', room: '401', instructor: 'Thenmozhi M' },
  { code: 'MS6030', name: 'Advanced Data Analytics for Management', room: '253', instructor: 'Usha Mohan' },
  { code: 'MS5613', name: 'Corporate Hedging Strategies', room: '252', instructor: 'Madhumathi R' },
  { code: 'MS5770', name: 'Strategic Marketing', room: '253', instructor: 'Vaibhav Chawla' },
  { code: 'MS5750', name: 'Brand Management', room: '252', instructor: 'Varisha Rehman' },
  { code: 'MS6022', name: 'AI for Management', room: '253', instructor: 'Saji Mathew' },
  { code: 'MS6600', name: 'Global Corporate Governance', room: '252', instructor: 'Arun Kumar G' },
  { code: 'MS6230', name: 'Strategic Sourcing', room: '253', instructor: 'Arshinder Kaur' },
];

/** How the sheet abbreviates courses. */
const ACRONYMS: Record<string, string> = {
  MS5015: 'DT', MS6580: 'SDM', MS5460: 'CM', MS5690: 'CF', MS5529: 'B.Lab', MS6230: 'SS', MS5613: 'CHS',
  MS5770: 'SM', MS6030: 'ADAM', MS5750: 'BM', MS6600: 'GCG', MS6022: 'AIM', MS6210: 'Bs.Models',
};

/** The sheet's slots, in order; the 12-1 lunch slot never holds a class. */
export const SLOT_TIMES: Record<string, [string, string]> = {
  '8am-10am': ['08:00', '10:00'],
  '10am-12pm': ['10:00', '12:00'],
  '1pm-3pm': ['13:00', '15:00'],
  '3pm-5pm': ['15:00', '17:00'],
  '5pm-7pm': ['17:00', '19:00'],
};

export type Q567Change = { status?: string; toYmd?: string; toSlot?: string; start?: string; end?: string; code?: string; note?: string };
export type Q567Input = {
  /** `schedule/daily`: keys like "2026-10-15 Thursday", each with slot → cell. */
  daily: Record<string, Record<string, unknown>> | null | undefined;
  /** `schedule_changes`: ymd → "<slot>_<code>" → change. */
  changes: Record<string, Record<string, Q567Change>> | null | undefined;
  /** Course codes you take: your electives (the core courses are always added). */
  electives: string[];
  /** Sessions you hid, `<ymd>_<slot>_<code>`. */
  hidden?: Record<string, unknown> | null;
  subjects?: Q567Subject[];
};

type Cell = string | { text?: string; strike?: boolean; isShifted?: boolean; shiftedTo?: string } | Array<Cell>;

const textOf = (cell: unknown): string =>
  Array.isArray(cell)
    ? cell.map(e => (e && typeof e === 'object' ? String((e as { text?: string }).text || '') : String(e ?? ''))).join(' / ')
    : cell && typeof cell === 'object' ? String((cell as { text?: string }).text || '') : String(cell ?? '');

const struck = (e: unknown, text: string) =>
  Boolean((e && typeof e === 'object' && (e as { strike?: boolean }).strike) || text.includes('~') || text.toLowerCase().includes('cancel') || /<s>|<strike>/i.test(text));

export function buildQ567Classes(input: Q567Input): Q567Class[] {
  const all = input.subjects || Q6_SUBJECTS;
  const wanted = new Set(input.electives.map(c => c.toUpperCase()));
  const active = all.filter(s => s.isCore || wanted.has(s.code.toUpperCase()));
  const out: Q567Class[] = [];
  const changes = input.changes || {};
  const hidden = input.hidden || {};
  const classOf = (s: Q567Subject, date: string, slot: string, over: Partial<Q567Class> = {}): Q567Class => ({
    date, start: SLOT_TIMES[slot]?.[0] || '', end: SLOT_TIMES[slot]?.[1] || '', code: s.code, title: s.name,
    room: s.room || null, instructor: s.instructor || null, kind: 'class', status: 'ok', note: null, ...over,
  });

  for (const [key, slots] of Object.entries(input.daily || {})) {
    const date = key.split(' ')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slots) continue;
    for (const slot of Object.keys(SLOT_TIMES)) {
      const cell = (slots as Record<string, Cell>)[slot];
      const text = textOf(cell);
      if (!text) continue;
      const cellCancelled = struck(cell, text);
      const [start, end] = SLOT_TIMES[slot];

      if (text.toUpperCase().includes('ICRC')) {
        const icrc = Array.isArray(cell) ? cell.find(e => e && typeof e === 'object' && textOf(e).toUpperCase().includes('ICRC')) : cell;
        const t = textOf(icrc);
        out.push({
          date, start, end, code: 'ICRC', title: t.replace(/[~*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'ICRC session', room: null,
          instructor: null, kind: 'icrc', status: struck(icrc, t) ? 'cancelled' : 'ok', note: null,
        });
        continue;
      }

      const parts = text.split('/').map(c => c.trim().toLowerCase());
      for (const s of active) {
        const acr = (ACRONYMS[s.code] || '').toLowerCase();
        const code = s.code.toLowerCase();
        const name = s.name.toLowerCase();
        if (!parts.some(c => c === code || (acr && c === acr) || c === name)) continue;
        let cancelled = cellCancelled;
        if (Array.isArray(cell)) {
          const mine = cell.find(e => e && typeof e === 'object' && ((textOf(e).toLowerCase().includes(code)) || (acr && textOf(e).toLowerCase().includes(acr)) || textOf(e).toLowerCase().includes(name)));
          if (mine) cancelled = struck(mine, textOf(mine));
        }
        const row = classOf(s, date, slot, { status: cancelled ? 'cancelled' : 'ok' });
        const ch = (changes[date] || {})[`${slot}_${s.code}`];
        if (ch) {
          if (ch.status === 'cancelled' || ch.status === 'moved') row.status = 'cancelled';
          if (ch.status === 'retimed' && ch.start && ch.end) Object.assign(row, { start: ch.start, end: ch.end, status: 'retimed' });
          if (ch.note) row.note = String(ch.note).slice(0, 120);
        }
        if (hidden[`${date}_${slot}_${s.code}`]) break;
        out.push(row);
        break; // one course per slot, like q567
      }
    }
  }

  // Classes moved onto a day from elsewhere
  for (const byDay of Object.values(changes)) {
    for (const ch of Object.values(byDay || {})) {
      if (!ch || ch.status !== 'moved' || !ch.toYmd || !ch.toSlot) continue;
      const s = active.find(x => x.code === ch.code);
      if (!s || hidden[`${ch.toYmd}_${ch.toSlot}_${s.code}`]) continue;
      out.push(classOf(s, ch.toYmd, ch.toSlot, {
        status: 'moved', note: ch.note ? String(ch.note).slice(0, 120) : null,
        ...(ch.start && ch.end ? { start: ch.start, end: ch.end } : {}),
      }));
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

// ---- What the pusher may send us ----------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

function cleanCell(v: unknown): unknown {
  if (typeof v === 'string') return v.slice(0, 200);
  if (Array.isArray(v)) return v.slice(0, 6).map(cleanCell);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { text: str(o.text, 200) || '', ...(o.strike ? { strike: true } : {}), ...(o.isShifted ? { isShifted: true } : {}), ...(str(o.shiftedTo, 40) ? { shiftedTo: str(o.shiftedTo, 40) } : {}) };
  }
  return '';
}

/**
 * Keeps only what the timetable needs from a pushed payload: the sheet's slots, the change fields (never who posted
 * them), course codes and hidden-session keys. Anything else, including names and rolls, is dropped.
 */
export function sanitizeQ567Push(body: unknown): Omit<Q567Input, 'subjects'> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  if (!b.daily || typeof b.daily !== 'object') return null;
  const daily: Record<string, Record<string, unknown>> = {};
  for (const [k, slots] of Object.entries(b.daily as Record<string, any>).slice(0, 400)) {
    if (!/^\d{4}-\d{2}-\d{2} [A-Za-z]{3,9}$/.test(k) || !slots || typeof slots !== 'object') continue;
    daily[k] = {};
    for (const slot of Object.keys(SLOT_TIMES)) if (slots[slot] != null) daily[k][slot] = cleanCell(slots[slot]);
  }
  const changes: Record<string, Record<string, Q567Change>> = {};
  for (const [ymd, byKey] of Object.entries((b.changes || {}) as Record<string, any>).slice(0, 400)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !byKey || typeof byKey !== 'object') continue;
    changes[ymd] = {};
    for (const [key, ch] of Object.entries(byKey as Record<string, any>).slice(0, 60)) {
      if (!ch || typeof ch !== 'object' || key.length > 40) continue;
      const time = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : undefined);
      const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      changes[ymd][key] = { status: str(ch.status, 12), code: str(ch.code, 20), toYmd: day(ch.toYmd), toSlot: str(ch.toSlot, 12), start: time(ch.start), end: time(ch.end), note: str(ch.note, 120) };
    }
  }
  const electives = (Array.isArray(b.electives) ? b.electives : []).map((c: unknown) => str(c, 20)).filter(Boolean).slice(0, 12) as string[];
  const hidden: Record<string, true> = {};
  for (const k of Object.keys(b.hidden || {}).slice(0, 300)) if (k.length <= 60) hidden[k] = true;
  return { daily, changes, electives, hidden };
}
