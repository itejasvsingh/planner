/**
 * Decides which statement rows are new and which are already in Align. Pure (no imports) so tests can load
 * it directly (tests/statement-match.test.cjs).
 */

export type StatementTxn = {
  date: string;
  description: string;
  merchant: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  ref: string | null;
};

export type ExistingItem = { id: string; type?: string; amount?: string | number; date?: string | null; dueDate?: string | null };

export type MatchStatus = 'new' | 'imported' | 'likely' | 'deleted';
export type PlannedRow = StatementTxn & { id: string; status: MatchStatus; matchId?: string };

/** Key for rows without a bank reference: same day, amount, direction and narration. */
export function rowKey(r: StatementTxn) {
  return `${r.date}|${r.type}|${r.amount.toFixed(2)}|${r.description.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

/**
 * Text hashed into each row's document id. Rows with a UPI/IMPS ref use the same text as SMS auto-import
 * (`<phone>_ref_<ref>`), so a payment seen in both lands on one document; others use the row's key plus its
 * position among identical rows, so importing the same statement twice changes nothing.
 */
export function idSeeds(phone: string, rows: StatementTxn[]): string[] {
  const seen = new Map<string, number>();
  const refs = new Set<string>();
  return rows.map(r => {
    // A ref seen twice in one file (e.g. a payment and its reversal) only keys the first row.
    if (r.ref && !refs.has(r.ref)) { refs.add(r.ref); return `${phone}_ref_${r.ref}`; }
    const k = rowKey(r);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return `${phone}_stmt_${k}#${n}`;
  });
}

const DAY = 86400000;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const isMoney = (t?: string) => t === 'expense' || t === 'income' || t === 'deposit';
const direction = (t?: string) => (t === 'expense' ? 'expense' : 'income');

/**
 * `imported`: the exact document already exists (imported before, or recorded from the same SMS).
 * `likely`: an existing transaction has the same amount and direction within 3 days (typed in by hand, or
 * an SMS whose ref differed); left unticked so it isn't counted twice. Each existing item matches once.
 * `deleted`: the user deleted this transaction in Align (`deletedIds`); not offered again.
 */
export function planRows(rows: StatementTxn[], ids: string[], items: ExistingItem[], deletedIds: string[] = []): PlannedRow[] {
  const deleted = new Set(deletedIds);
  const byId = new Set(items.map(i => i.id));
  const pool = items.filter(i => isMoney(i.type));
  const used = new Set<string>(ids.filter(id => byId.has(id)));
  return rows.map((r, i) => {
    const id = ids[i];
    if (deleted.has(id)) return { ...r, id, status: 'deleted' as const };
    if (byId.has(id)) return { ...r, id, status: 'imported' as const, matchId: id };
    let best: ExistingItem | null = null;
    let bestGap = Infinity;
    for (const it of pool) {
      if (used.has(it.id) || direction(it.type) !== r.type) continue;
      if (Math.abs(Number(it.amount) - r.amount) > 0.01) continue;
      const when = it.date || it.dueDate;
      if (!when) continue;
      const gap = dayDiff(when, r.date);
      if (gap <= 3 && gap < bestGap) { best = it; bestGap = gap; }
    }
    if (best) {
      used.add(best.id);
      return { ...r, id, status: 'likely' as const, matchId: best.id };
    }
    return { ...r, id, status: 'new' as const };
  });
}
