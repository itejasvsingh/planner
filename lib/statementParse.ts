/**
 * Turns a bank or card statement into transactions. Pure (no imports) so tests can load it directly
 * (tests/statement-parse.test.cjs); the API route does the file reading and adds categories.
 *
 * Two inputs:
 *  - tableToRows: a spreadsheet/CSV grid. Finds the header row (Date / Narration / Withdrawal / Deposit /
 *    Balance, or Amount + Dr/Cr), then reads each row under it.
 *  - linesToRows: text lines from a PDF. A transaction starts with a date; following lines without a date
 *    continue its description. Money/direction comes from the running balance when there is one
 *    (previous balance − amount = new balance means money went out), else from Cr/Dr markers.
 */

export type StatementRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'expense' | 'income';
  /** 12-digit UPI/IMPS reference when present (same as bank SMS carry, so the two de-duplicate). */
  ref: string | null;
  balance: number | null;
};

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Day-first dates as Indian banks write them, ISO dates, Excel serial numbers and Date objects. */
export function parseDateCell(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    // Excel serial day (1900 system)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s/.-]?([A-Za-z]{3,4})[a-z]*[\s/.,-]*(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

/** "1,23,456.78", "250", "(120.00)", "-75.5", "1,200.00 Dr". Returns the absolute value and any sign/marker. */
export function parseMoney(v: unknown): { value: number; marker: 'cr' | 'dr' | null; negative: boolean } | null {
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0 ? { value: Math.abs(v), marker: null, negative: v < 0 } : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\()?\s*(-)?\s*(?:₹|rs\.?|inr)?\s*(-)?([\d,]*\d(?:\.\d{1,2})?)\s*(\))?\s*(cr|dr|c|d)?\.?$/i);
  if (!m) return null;
  const value = parseFloat(m[4].replace(/,/g, ''));
  if (!Number.isFinite(value) || value === 0) return null;
  const mk = m[6]?.toLowerCase();
  return { value, marker: mk === 'cr' || mk === 'c' ? 'cr' : mk === 'dr' || mk === 'd' ? 'dr' : null, negative: !!(m[1] || m[2] || m[3]) };
}

export function extractRef(text: string): string | null {
  const m = text.match(/(?<![\d])(\d{12})(?![\d])/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- spreadsheets / CSV

type Columns = { date: number; desc: number; debit: number; credit: number; amount: number; drcr: number; balance: number; ref: number };

const H = {
  date: /^(?:txn\.?|tran\.?|transaction|posting|post|value)?\s*date$|^date\b/i,
  valueDate: /value\s*d(?:a)?t(?:e)?/i,
  desc: /narration|description|particulars|details|remarks|transaction\s*(?:remarks|details|particulars)|merchant/i,
  debit: /withdrawal|debit|\bdr\b|paid\s*out|money\s*out|spent/i,
  credit: /deposit|credit|\bcr\b|paid\s*in|money\s*in|received/i,
  amount: /amount|amt/i,
  drcr: /^(?:dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn\s*type|debit\s*\/\s*credit|d\/c|c\/d)$/i,
  balance: /balance/i,
  ref: /chq|cheque|ref(?:erence)?|utr|txn\s*id/i,
};

function findColumns(row: unknown[]): Columns | null {
  const cells = row.map(c => String(c ?? '').replace(/\s+/g, ' ').trim());
  const col: Columns = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1, drcr: -1, balance: -1, ref: -1 };
  cells.forEach((c, i) => {
    if (!c || c.length > 40) return;
    if (H.balance.test(c)) { if (col.balance < 0) col.balance = i; return; }
    if (H.drcr.test(c)) { col.drcr = i; return; }
    if (H.date.test(c) || H.valueDate.test(c)) {
      // Prefer the transaction date over the value date.
      if (col.date < 0 || (H.valueDate.test(cells[col.date]) && !H.valueDate.test(c))) col.date = i;
      return;
    }
    if (H.desc.test(c)) { if (col.desc < 0) col.desc = i; return; }
    if (H.debit.test(c) && !H.credit.test(c)) { if (col.debit < 0) col.debit = i; return; }
    if (H.credit.test(c) && !H.debit.test(c)) { if (col.credit < 0) col.credit = i; return; }
    if (H.amount.test(c)) { if (col.amount < 0) col.amount = i; return; }
    if (H.ref.test(c)) { if (col.ref < 0) col.ref = i; }
  });
  const hasMoney = col.debit >= 0 || col.credit >= 0 || col.amount >= 0;
  return col.date >= 0 && col.desc >= 0 && hasMoney ? col : null;
}

export function tableToRows(table: unknown[][]): StatementRow[] {
  let col: Columns | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(table.length, 60); i++) {
    col = findColumns(table[i] || []);
    if (col) { start = i + 1; break; }
  }
  if (!col) return [];

  const amountCol = col.amount;
  const signed = amountCol >= 0 && table.slice(start).some(r => parseMoney((r || [])[amountCol])?.negative);

  const rows: StatementRow[] = [];
  for (let i = start; i < table.length; i++) {
    const r = table[i] || [];
    const date = parseDateCell(r[col.date]);
    if (!date) continue;
    const description = String(r[col.desc] ?? '').replace(/\s+/g, ' ').trim();
    const debit = col.debit >= 0 ? parseMoney(r[col.debit]) : null;
    const credit = col.credit >= 0 ? parseMoney(r[col.credit]) : null;
    let amount = 0;
    let type: StatementRow['type'] | null = null;
    if (debit && !credit) { amount = debit.value; type = debit.negative ? 'income' : 'expense'; }
    else if (credit && !debit) { amount = credit.value; type = credit.negative ? 'expense' : 'income'; }
    else if (!debit && !credit && col.amount >= 0) {
      const a = parseMoney(r[col.amount]);
      if (a) {
        amount = a.value;
        const drcr = col.drcr >= 0 ? String(r[col.drcr] ?? '').trim().toLowerCase() : '';
        if (/^(?:cr|c|credit)/.test(drcr) || a.marker === 'cr') type = 'income';
        else if (/^(?:dr|d|debit)/.test(drcr) || a.marker === 'dr') type = 'expense';
        // Signed exports: negative is money out. All-positive exports (card statements) list spends.
        else if (signed) type = a.negative ? 'expense' : 'income';
        else type = /\b(?:refund|reversal|cashback|payment received|thank you)\b/i.test(description) ? 'income' : 'expense';
      }
    }
    if (!type || !(amount > 0)) continue;
    const refCell = col.ref >= 0 ? String(r[col.ref] ?? '') : '';
    const bal = col.balance >= 0 ? parseMoney(r[col.balance]) : null;
    rows.push({
      date,
      description: description || 'Transaction',
      amount: round2(amount),
      type,
      ref: extractRef(refCell) || extractRef(description),
      balance: bal ? (bal.negative || bal.marker === 'dr' ? -bal.value : bal.value) : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------- PDF text lines

const LEAD_DATE = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,4}[\s,-]+\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY = /(?<![\d.,])(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}(?![\d])(?:\s*(?:Cr|Dr|CR|DR|cr|dr)\b\.?)?/g;
const STOP = /opening balance|closing balance|statement summary|total|balance (?:b\/f|c\/f|brought|carried)|page \d+ of|generated on|^\s*date\b/i;

function moneyTokens(s: string) {
  return [...s.matchAll(MONEY)].map(m => {
    const p = parseMoney(m[0].replace(/\s+/g, ' '));
    return { text: m[0], value: p ? p.value : 0, marker: p ? p.marker : null };
  }).filter(t => t.value > 0);
}

export function linesToRows(lines: string[]): StatementRow[] {
  type Block = { date: string; head: string; rest: string[] };
  const blocks: Block[] = [];
  let opening: number | null = null;
  let cur: Block | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const ob = line.match(/opening balance[^\d]*((?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})/i);
    if (ob && opening == null && !blocks.length) opening = parseFloat(ob[1].replace(/,/g, ''));
    const lead = line.match(LEAD_DATE);
    const date = lead ? parseDateCell(lead[1]) : null;
    if (date) {
      if (cur) blocks.push(cur);
      cur = { date, head: line.slice(lead![0].length), rest: [] };
    } else if (cur) {
      if (STOP.test(line)) { blocks.push(cur); cur = null; }
      else if (cur.rest.length < 4) cur.rest.push(line);
    }
  }
  if (cur) blocks.push(cur);

  const rows: StatementRow[] = [];
  let prev: number | null = opening;
  for (const b of blocks) {
    // A second leading date (value date) is not part of the description.
    const head = b.head.replace(LEAD_DATE, '');
    let tokens = moneyTokens(head);
    if (!tokens.length) tokens = moneyTokens([head, ...b.rest].join(' '));
    if (!tokens.length) continue;
    const amountTok = tokens.length >= 2 ? tokens[tokens.length - 2] : tokens[0];
    const balTok = tokens.length >= 2 ? tokens[tokens.length - 1] : null;
    const amount = amountTok.value;
    const balance = balTok ? (balTok.marker === 'dr' ? -balTok.value : balTok.value) : null;

    let type: StatementRow['type'] | null = null;
    if (prev != null && balance != null) {
      if (Math.abs(prev - amount - balance) < 0.011) type = 'expense';
      else if (Math.abs(prev + amount - balance) < 0.011) type = 'income';
    }
    if (!type && amountTok.marker) type = amountTok.marker === 'cr' ? 'income' : 'expense';
    if (!type) type = /\b(?:cr|credit|deposit|salary|refund|reversal|interest|received|by transfer|neft cr|imps cr)\b|\/cr\//i.test(head) ? 'income' : 'expense';
    if (balance != null) prev = balance;

    let description = [head, ...b.rest].join(' ');
    for (const t of tokens) description = description.replace(t.text, ' ');
    description = description.replace(/\s+/g, ' ').trim();
    rows.push({ date: b.date, description: description || 'Transaction', amount: round2(amount), type, ref: extractRef([b.head, ...b.rest].join(' ')), balance });
  }
  return rows;
}

// ---------------------------------------------------------------- PDF tables (positioned text)

/** A text fragment on a PDF page; y grows upwards (PDF coordinates). */
export type PdfItem = { str: string; x: number; y: number; w: number; page: number };

type ColKey = 'date' | 'desc' | 'debit' | 'credit' | 'amount' | 'balance' | 'skip';
type Col = { key: ColKey; x: number; end: number };

const HEAD: [ColKey, RegExp][] = [
  // Columns whose contents are ignored (value date, cheque/ref no., branch); listed first so "Value Date" isn't the date.
  ['skip', /^(?:value|ref|chq|cheque|instrument|branch|sl\.?\s*no|s\.?\s*no|no\.)/i],
  ['balance', /^balance/i],
  ['debit', /^(?:debit|withdrawals?|dr)\b/i],
  ['credit', /^(?:credit|deposits?|cr)\b/i],
  ['amount', /^amount/i],
  ['desc', /^(?:description|narration|particulars|details|remarks|transaction\s*(?:details|remarks))/i],
  ['date', /^(?:txn|tran|transaction|post(?:ing)?)?\.?\s*date$|^date\b|^txn\b/i],
];
const MONEY_ONLY = /^\(?-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}\)?\s*(?:cr|dr)?\.?$/i;

/** Column header positions on a page: the header row holds Balance/Debit/Credit/Amount and Date. */
function headerColumns(items: PdfItem[]): { cols: Col[]; y: number } | null {
  const anchors = items.filter(it => /^(?:balance|debit|credit|withdrawals?|deposits?|amount)\b/i.test(it.str.trim()));
  for (const a of anchors) {
    const band = items.filter(it => Math.abs(it.y - a.y) <= 14);
    const cols: Col[] = [];
    for (const it of band) {
      const t = it.str.trim();
      const hit = HEAD.find(([, re]) => re.test(t));
      if (!hit) continue;
      const key = hit[0];
      if (key === 'skip') { cols.push({ key, x: it.x, end: it.x + it.w }); continue; }
      // The leftmost date header is the transaction date (a second one is usually the value date).
      const prev = cols.find(c => c.key === key);
      if (prev) { if (key === 'date' && it.x < prev.x) Object.assign(prev, { x: it.x, end: it.x + it.w }); continue; }
      cols.push({ key, x: it.x, end: it.x + it.w });
    }
    // A "Date" under "Value" (two-line header) belongs to the value-date column, not a second date column.
    const keys = new Set(cols.map(c => c.key));
    if (keys.has('date') && (keys.has('debit') || keys.has('credit') || keys.has('amount'))) {
      return { cols: cols.sort((a, b) => a.x - b.x), y: Math.min(...band.map(it => it.y)) };
    }
  }
  return null;
}

/**
 * Rebuilds table rows from positioned PDF text, for statements whose cells wrap over several lines.
 * Each transaction is anchored on its amount/balance figures; every other fragment joins the nearest anchor.
 */
export function itemsToRows(items: PdfItem[]): StatementRow[] {
  const pages = [...new Set(items.map(it => it.page))].sort((a, b) => a - b);
  let cols: Col[] | null = null;
  const rows: StatementRow[] = [];
  let prev: number | null = null;
  const ob = items.map(it => it.str).join(' ').match(/opening balance[^\d]*((?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})/i);
  if (ob) prev = parseFloat(ob[1].replace(/,/g, ''));

  for (const page of pages) {
    let body = items.filter(it => it.page === page && it.str.trim());
    const head = headerColumns(body);
    if (head) { cols = head.cols; body = body.filter(it => it.y < head.y - 2); }
    if (!cols) continue;
    const c = cols;
    const moneyCols = c.filter(col => col.key !== 'date' && col.key !== 'desc' && col.key !== 'skip');
    const center = (col: Col) => (col.x + col.end) / 2;
    const desc = c.find(col => col.key === 'desc');
    const dateZone = c.filter(col => col.key === 'date' || col.key === 'skip');
    const firstMoney = Math.min(...moneyCols.map(col => col.x));
    const overlaps = (it: PdfItem, col: Col) => Math.min(it.x + it.w, col.end) - Math.max(it.x, col.x) > 0;
    // Description text is left-aligned under a header that may be centred: learn where its lines start.
    const descStarts = desc ? body.filter(it => !MONEY_ONLY.test(it.str.trim()) && overlaps(it, desc)).map(it => it.x) : [];
    const DATE_PART = /^(?:\d{1,2}|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)\b|^\d{1,2}[/.-]/i;
    const colOf = (it: PdfItem): ColKey | null => {
      const t = it.str.trim();
      if (MONEY_ONLY.test(t) && it.x + it.w > firstMoney - 20) {
        const mid = it.x + it.w / 2;
        // Numbers are right-aligned under their header: compare right edges as well as centres.
        let best: Col | null = null; let dist = Infinity;
        for (const col of moneyCols) {
          const d = Math.min(Math.abs(center(col) - mid), Math.abs(col.end - (it.x + it.w)));
          if (d < dist) { dist = d; best = col; }
        }
        return best ? best.key : null;
      }
      if (descStarts.some(x => Math.abs(x - it.x) < 3)) return 'desc';
      if (DATE_PART.test(t) && dateZone.length) {
        const mid = it.x + it.w / 2;
        const near = dateZone.reduce((a, b) => (Math.abs(center(a) - mid) <= Math.abs(center(b) - mid) ? a : b));
        if (!desc || Math.abs(center(near) - mid) < Math.abs(center(desc) - mid)) return near.key === 'date' ? 'date' : null;
      }
      const over = c.find(col => overlaps(it, col));
      if (over) return over.key === 'skip' ? null : over.key;
      return desc && it.x > Math.max(...dateZone.map(col => col.end), -Infinity) && it.x < firstMoney ? 'desc' : null;
    };
    const placed = body.map(it => ({ it, key: colOf(it) }));
    // Anchor: the balance figure when there's a balance column, else the debit/credit/amount figure.
    const anchorKey: ColKey[] = c.some(col => col.key === 'balance') ? ['balance'] : ['debit', 'credit', 'amount'];
    const anchors = placed.filter(p => p.key && anchorKey.includes(p.key) && MONEY_ONLY.test(p.it.str.trim())).map(p => p.it.y).sort((a, b) => b - a);
    if (!anchors.length) continue;
    const lastAnchor = anchors[anchors.length - 1];
    const groups = anchors.map(() => [] as { it: PdfItem; key: ColKey | null }[]);
    for (const p of placed) {
      // Text far below the last row is footer (totals, notes).
      if (p.it.y < lastAnchor - 40) continue;
      let gi = 0; let gd = Infinity;
      anchors.forEach((ay, i) => { const d = Math.abs(ay - p.it.y); if (d < gd) { gd = d; gi = i; } });
      if (gd <= 40) groups[gi].push(p);
    }
    for (const g of groups) {
      const text = (k: ColKey) => g.filter(p => p.key === k).sort((a, b) => b.it.y - a.it.y || a.it.x - b.it.x).map(p => p.it.str.trim()).join(' ');
      const date = parseDateCell(text('date').replace(/\s+/g, ' '));
      if (!date) continue;
      const debit = parseMoney(text('debit'));
      const credit = parseMoney(text('credit'));
      const amt = parseMoney(text('amount'));
      const bal = parseMoney(text('balance'));
      const balance = bal ? (bal.marker === 'dr' || bal.negative ? -bal.value : bal.value) : null;
      let amount = 0; let type: StatementRow['type'] | null = null;
      if (debit && !credit) { amount = debit.value; type = 'expense'; }
      else if (credit && !debit) { amount = credit.value; type = 'income'; }
      else if (amt) {
        amount = amt.value;
        if (prev != null && balance != null) type = Math.abs(prev - amount - balance) < 0.011 ? 'expense' : Math.abs(prev + amount - balance) < 0.011 ? 'income' : null;
        if (!type) type = amt.marker === 'cr' ? 'income' : amt.marker === 'dr' || amt.negative ? 'expense' : 'expense';
      }
      if (balance != null) prev = balance;
      if (!type || !(amount > 0)) continue;
      const description = text('desc').replace(/\s+/g, ' ').replace(/-\s+(?=\S)/g, '-').trim();
      const all = g.map(p => p.it.str).join(' ');
      rows.push({ date, description: description || 'Transaction', amount: round2(amount), type, ref: extractRef(description) || extractRef(all), balance });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- names

const CODES = new Set([
  'upi', 'dr', 'cr', 'p2m', 'p2a', 'p2p', 'neft', 'imps', 'rtgs', 'ach', 'nach', 'ecs', 'mob', 'mb', 'ib', 'inb', 'net', 'pos', 'ecom', 'bil', 'onl',
  'to', 'by', 'transfer', 'trf', 'payment', 'pay', 'paid', 'sent', 'using', 'via', 'na', 'null', 'pvt', 'ltd', 'txn', 'ref', 'no', 'upiintent',
  'collect', 'request', 'debit', 'credit', 'card', 'a', 'c', 'd', 'tpt', 'fund', 'funds', 'vps', 'vpa', 'sbin', 'hdfc', 'icici', 'axis', 'kotak',
  'yesb', 'utib', 'mmt', 'bbps', 'si', 'kkbk', 'icic', 'pytm', 'ybl', 'okaxis', 'okhdfcbank', 'oksbi', 'okicici', 'paytm', 'phonepe', 'gpay', 'bank', 'others',
]);

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase());

/** "UPI/427512345678/ZOMATO/zomato@hdfc/Pay" → "Zomato". Falls back to a trimmed description. */
export function cleanNarration(desc: string): string {
  const d = desc.replace(/\s+/g, ' ').trim();
  if (/\batm\b|cash wdl|cash withdrawal|\bnwd\b|\bawb\b/i.test(d)) return 'ATM withdrawal';
  if (/\bint(?:erest)?\.?\s*(?:pd|paid|credit|cr)\b|^interest\b/i.test(d)) return 'Interest';
  if (/payment received|thank you|autopay|card ?payment|cc payment/i.test(d)) return 'Card payment';
  if (/\bsalary\b|\bsal\b/i.test(d)) {
    const who = d.match(/(?:neft|imps|rtgs)[^a-z]*(?:cr)?[-/ ]+(?:[A-Z]{4}0[A-Z0-9]{6}[-/ ]+)?([A-Za-z][A-Za-z .&]{2,30})/i);
    return who ? `Salary · ${title(who[1].trim())}` : 'Salary';
  }
  const parts = d.split(/[/|\\]+|\s+-\s+|-(?=[A-Za-z0-9])/);
  for (const part of parts) {
    const words = part
      .split(/\s+/)
      .filter(w => w && !w.includes('@') && !/\d{4,}/.test(w) && !/x{2,}/i.test(w) && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(w) && !CODES.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const name = words.join(' ').replace(/[^\w &.'-]/g, '').replace(/\s+(?:in|ind)$/i, '').trim();
    if (name.length >= 2 && /[a-z]{2}/i.test(name)) return title(name).slice(0, 40).trim();
  }
  return d.slice(0, 40) || 'Transaction';
}

const round2 = (n: number) => Math.round(n * 100) / 100;
