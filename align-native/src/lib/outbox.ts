import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { drain, enqueue, withTimeout, SERVER_TIMESTAMP, type DocData, type OutboxOp, type WriteResult } from '@/lib/outbox-core';

/**
 * Offline-first writes. Every change is applied on screen at once, saved to this queue on the device, and sent
 * to Firestore in order whenever there's a connection. The queue survives app restarts, so nothing typed
 * offline is lost. See lib/outbox-core.ts for the queue rules.
 */

type Snapshot = { queue: OutboxOp[]; online: boolean | null; dropped: number };
type State = {
  snapshot: Snapshot;
  loaded: Promise<void> | null;
  flushing: boolean;
  retry: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
};

const RETRY_MS = 30_000;
const WRITE_TIMEOUT_MS = 15_000;
const storageKey = (owner: string) => `align_outbox_${owner}`;
const states = new Map<string, State>();

function stateFor(owner: string): State {
  let s = states.get(owner);
  if (!s) {
    s = { snapshot: { queue: [], online: null, dropped: 0 }, loaded: null, flushing: false, retry: null, listeners: new Set() };
    states.set(owner, s);
  }
  return s;
}

function update(owner: string, patch: Partial<Snapshot>) {
  const s = stateFor(owner);
  s.snapshot = { ...s.snapshot, ...patch };
  s.listeners.forEach(l => l());
}

function ensureLoaded(owner: string): Promise<void> {
  const s = stateFor(owner);
  if (!s.loaded) {
    s.loaded = getItem(storageKey(owner)).then(raw => {
      let stored: OutboxOp[] = [];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) stored = parsed;
      } catch { /* ignore a corrupt queue */ }
      // Ops queued before the stored queue finished loading go after it.
      if (stored.length) update(owner, { queue: [...stored, ...s.snapshot.queue] });
    });
  }
  return s.loaded;
}

function persist(owner: string) {
  void setItem(storageKey(owner), JSON.stringify(stateFor(owner).snapshot.queue));
}

/** Document id generated on the device, so a create made offline keeps its id when it reaches the server. */
export function newDocId(col = 'planner_items') {
  return doc(collection(db, col)).id;
}

/** Firestore rejects undefined values; drop them. */
export function cleanData(data: DocData): DocData {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

type NewOp =
  | { kind: 'set'; col: string; id: string; data: DocData; merge?: boolean; mergeFields?: string[] }
  | { kind: 'update'; col: string; id: string; patch: DocData }
  | { kind: 'delete'; col: string; id: string };

/** Queue a write for `owner` (the signed-in phone) and try to send it now. Returns once it's queued. */
export async function pushOp(owner: string, op: NewOp) {
  await ensureLoaded(owner);
  const s = stateFor(owner);
  const withTime = { ...op, at: Date.now() } as OutboxOp;
  if (withTime.kind === 'set') withTime.data = cleanData(withTime.data);
  if (withTime.kind === 'update') withTime.patch = cleanData(withTime.patch);
  update(owner, { queue: enqueue(s.snapshot.queue, withTime) });
  persist(owner);
  void flush(owner);
}

function toFirestore(data: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === SERVER_TIMESTAMP ? serverTimestamp() : v;
  return out;
}

const PERMANENT = new Set(['permission-denied', 'invalid-argument', 'not-found', 'failed-precondition', 'out-of-range']);

function writeOp(op: OutboxOp): Promise<WriteResult> {
  const ref = doc(db, op.col, op.id);
  const p =
    op.kind === 'set'
      ? setDoc(ref, toFirestore(op.data), op.mergeFields ? { mergeFields: op.mergeFields } : op.merge ? { merge: true } : {})
      : op.kind === 'update'
        ? updateDoc(ref, toFirestore(op.patch))
        : deleteDoc(ref);
  return withTimeout(
    p.then(
      () => 'ok' as WriteResult,
      (e: { code?: string }) => {
        const code = String(e?.code || '').replace(/^firestore\//, '');
        if (PERMANENT.has(code)) {
          console.warn(`Dropping a change the server rejected (${code}):`, op.col, op.id);
          return 'drop' as WriteResult;
        }
        return 'retry' as WriteResult;
      },
    ),
    WRITE_TIMEOUT_MS,
    'retry',
  );
}

/** Sends queued writes in order; reschedules itself while anything is left (e.g. offline). */
export async function flush(owner: string) {
  await ensureLoaded(owner);
  const s = stateFor(owner);
  if (s.flushing || !s.snapshot.queue.length) return;
  if (s.retry) clearTimeout(s.retry);
  s.retry = null;
  // The browser already knows it has no connection: show "Offline" now instead of after a write times out.
  if (browserOffline()) {
    if (s.snapshot.online !== false) update(owner, { online: false });
    s.retry = setTimeout(() => void flush(owner), RETRY_MS);
    return;
  }
  s.flushing = true;
  try {
    const { remaining, sent, dropped } = await drain(s.snapshot.queue.slice(), writeOp);
    // New ops may have been queued (or folded into queued ones) while sending; remove only what was handled.
    const handled = new Set<OutboxOp>([...sent, ...dropped]);
    update(owner, {
      queue: s.snapshot.queue.filter(op => !handled.has(op)),
      online: remaining.length === 0 ? true : sent.length > 0 ? s.snapshot.online : false,
      dropped: s.snapshot.dropped + dropped.length,
    });
    persist(owner);
  } finally {
    s.flushing = false;
  }
  if (s.snapshot.queue.length) s.retry = setTimeout(() => void flush(owner), RETRY_MS);
}

function browserOffline() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false;
}

function flushAll() {
  states.forEach((_, owner) => void flush(owner));
}

// Retry as soon as the app is back in front or the browser reports a connection.
let wired = false;
function wireTriggers() {
  if (wired) return;
  wired = true;
  AppState.addEventListener('change', st => { if (st === 'active') flushAll(); });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', flushAll);
    window.addEventListener('offline', flushAll);
  }
}

/** Live view of the queue for `owner`: pending writes, whether the last attempt reached the server. */
export function useOutbox(owner: string): Snapshot {
  useEffect(() => {
    wireTriggers();
    void ensureLoaded(owner).then(() => flush(owner));
  }, [owner]);
  return useSyncExternalStore(
    cb => {
      const s = stateFor(owner);
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    () => stateFor(owner).snapshot,
    () => stateFor(owner).snapshot,
  );
}
