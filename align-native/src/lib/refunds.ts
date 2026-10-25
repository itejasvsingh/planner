type Txn = { id?: string; type?: string; amount?: number | string; date?: string; title?: string; refundOf?: string | null; refunded?: number; excluded?: boolean };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Words typed as tags ("#trip, work") → clean lowercase tags, at most 6, each up to 20 characters. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of String(text || '').split(/[\s,]+/)) {
    const t = raw.replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 6) break;
  }
  return out;
}
export const tagsText = (tags: unknown) => (Array.isArray(tags) ? tags.map((t) => `#${t}`).join(' ') : '');

/** Everything a search should look through for one transaction (merchant, category, amount, note, tags). */
export const searchText = (t: { title?: string; amount?: unknown; note?: string; tags?: string[] }, category: string) =>
  `${t.title || ''} ${category} ${t.amount ?? ''} ${t.note || ''} ${(t.tags || []).map((x) => `#${x} ${x}`).join(' ')}`.toLowerCase();

/** Spends a refund of `amount` could belong to: recent ones, those at least as large first, then the rest. */
export function refundTargets(items: Txn[], amount: number, excludeId?: string, limit = 25): Txn[] {
  const spends = items.filter((i) => i.type === 'expense' && i.id !== excludeId && !i.excluded).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const fits = (i: Txn) => num(i.amount) + num(i.refunded) >= amount;
  return [...spends.filter(fits), ...spends.filter((i) => !fits(i))].slice(0, limit);
}

/** How much of spend `targetId` has been refunded, from the refund transactions linked to it. */
export function refundedFor(items: Txn[], targetId: string, override?: { id?: string; target: string | null; amount: number }) {
  let sum = 0;
  for (const i of items) {
    if (override?.id && i.id === override.id) continue;
    if (i.refundOf === targetId) sum += num(i.amount);
  }
  if (override && override.target === targetId) sum += override.amount;
  return sum;
}

/**
 * The changes to make on other transactions when the refund `refundId` (now `amount`) points at `target` instead of `previous`:
 * each spend gets its `refunded` total recomputed (never more than it cost; the rest stays as income).
 */
export function refundPatches(items: Txn[], refundId: string | undefined, previous: string | null | undefined, target: string | null, amount: number) {
  const patches: { id: string; patch: { refunded: number } }[] = [];
  for (const id of new Set([previous, target].filter(Boolean) as string[])) {
    const spend = items.find((i) => i.id === id);
    if (!spend) continue;
    const total = refundedFor(items, id, { id: refundId, target, amount });
    patches.push({ id, patch: { refunded: Math.min(Math.round(total * 100) / 100, num(spend.amount)) } });
  }
  return patches;
}
