/**
 * Offline outbox: the queue of writes made on this device that the server hasn't confirmed yet.
 * Pure (no imports) so tests can load it directly (see tests/outbox.test.cjs); lib/outbox.ts wires it to
 * AsyncStorage and Firestore.
 *
 * Every write is idempotent when replayed: new items get their document id on the device (so a create is a
 * `set` to a known id, never a second `add`), updates set fields to final values, deletes of a missing doc
 * are no-ops. That makes "retry until the server confirms" safe even if an earlier attempt did land.
 */

export type DocData = Record<string, unknown>;

export type OutboxOp =
  | { kind: 'set'; col: string; id: string; data: DocData; merge?: boolean; mergeFields?: string[]; at: number }
  | { kind: 'update'; col: string; id: string; patch: DocData; at: number }
  | { kind: 'delete'; col: string; id: string; at: number };

/** Stored in place of serverTimestamp(), which can't be serialized; swapped back when the op is sent. */
export const SERVER_TIMESTAMP = '__server_timestamp__';

const sameDoc = (a: OutboxOp, b: { col: string; id: string }) => a.col === b.col && a.id === b.id;

/** Adds an op, folding it into earlier pending ops for the same document where that's equivalent. */
export function enqueue(queue: OutboxOp[], op: OutboxOp): OutboxOp[] {
  if (op.kind === 'delete') {
    // Nothing earlier for this doc matters any more; the delete alone is the final state.
    return [...queue.filter(q => !sameDoc(q, op)), op];
  }
  if (op.kind === 'update') {
    const idx = findLastIndex(queue, q => sameDoc(q, op));
    const prev = idx >= 0 ? queue[idx] : null;
    if (prev && prev.kind === 'set' && !prev.merge && !prev.mergeFields) {
      // A pending create absorbs later edits.
      const next = [...queue];
      next[idx] = { ...prev, data: { ...prev.data, ...op.patch }, at: op.at };
      return next;
    }
    if (prev && prev.kind === 'update') {
      const next = [...queue];
      next[idx] = { ...prev, patch: { ...prev.patch, ...op.patch }, at: op.at };
      return next;
    }
    return [...queue, op];
  }
  // set
  if (!op.merge && !op.mergeFields) return [...queue.filter(q => !sameDoc(q, op)), op];
  return [...queue, op];
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

/** Server data with this device's unconfirmed changes applied on top, for one collection. */
export function overlay<T extends { id: string }>(base: T[], queue: OutboxOp[], col: string): T[] {
  let out = base.slice();
  for (const op of queue) {
    if (op.col !== col) continue;
    const i = out.findIndex(x => x.id === op.id);
    if (op.kind === 'delete') {
      if (i >= 0) out.splice(i, 1);
    } else if (op.kind === 'update') {
      if (i >= 0) out[i] = { ...out[i], ...stripMarkers(op.patch) };
    } else {
      const doc = { ...(op.merge || op.mergeFields ? (i >= 0 ? out[i] : {}) : {}), ...stripMarkers(op.data), id: op.id } as unknown as T;
      if (i >= 0) out[i] = doc;
      else out = [doc, ...out];
    }
  }
  return out;
}

function stripMarkers(data: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(data)) if (v !== SERVER_TIMESTAMP) out[k] = v;
  return out;
}

export type WriteResult = 'ok' | 'retry' | 'drop';

/**
 * Sends ops oldest-first. Stops at the first op that can't be sent yet (offline, timeout), so later edits never
 * overtake earlier ones; drops ops the server permanently rejects (e.g. permission denied) so they can't block
 * the queue forever. Returns what's left plus anything dropped.
 */
export async function drain(
  queue: OutboxOp[],
  write: (op: OutboxOp) => Promise<WriteResult>,
): Promise<{ remaining: OutboxOp[]; sent: OutboxOp[]; dropped: OutboxOp[] }> {
  const remaining = queue.slice();
  const sent: OutboxOp[] = [];
  const dropped: OutboxOp[] = [];
  while (remaining.length) {
    const op = remaining[0];
    let result: WriteResult;
    try {
      result = await write(op);
    } catch {
      result = 'retry';
    }
    if (result === 'retry') break;
    remaining.shift();
    (result === 'ok' ? sent : dropped).push(op);
  }
  return { remaining, sent, dropped };
}

/** Resolves to `fallback` if `p` hasn't settled within `ms` (Firestore writes never settle while offline). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
