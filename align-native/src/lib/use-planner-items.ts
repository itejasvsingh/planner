import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { db, whenSignedIn } from '@/lib/firebase';
import { type PlannerItem, type PlannerSplit } from '@/lib/planner-item';
import { getItem, itemsCacheKey, setItem } from '@/lib/storage';
import { triggerHaptic } from '@/lib/haptics';
import { LayoutAnimation } from 'react-native';
import { getPhoneVariants } from '@/lib/phone';
import { billsToGenerate } from '@/lib/recurring';
import { newDocId, pushOp, pushOps, useOutbox } from '@/lib/outbox';
import { overlay, SERVER_TIMESTAMP, type OutboxOp } from '@/lib/outbox-core';

const COL = 'planner_items';

/**
 * Bills already auto-added (or attempted) this session, shared by every usePlannerItems instance. Several
 * screens mount the hook at once and each would otherwise add its own copy before the others' writes sync
 * back; and a failed save removes the optimistic copy, which without this guard would be re-added on every
 * items change (an endless write loop).
 */
const attemptedBills = new Set<string>();

export function parseCachedItems(raw: string | null): PlannerItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function injectParsedItemsLocally(targetPhone: string | null, newItems: PlannerItem[]) {
  const effectivePhone = targetPhone || 'guest';
  try {
    const raw = await getItem(itemsCacheKey(effectivePhone));
    const current = parseCachedItems(raw);
    const existingIds = new Set(current.map(i => i.id));
    const toAdd = newItems.filter(i => !existingIds.has(i.id));
    const combined = [...toAdd, ...current];
    await setItem(itemsCacheKey(effectivePhone), JSON.stringify(combined));
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('align_items_updated', { detail: { phone: effectivePhone } }));
    }
  } catch (e) {
    console.warn('Error injecting parsed items:', e);
  }
}

/**
 * One shared copy of the items per signed-in number. Every screen that calls usePlannerItems reads the same
 * list and the same Firestore listener, so a change re-renders each screen once and is saved to the device
 * once (batched), instead of every screen keeping, listening for and saving its own copy.
 */
type Shared = {
  items: PlannerItem[];
  loading: boolean;
  error: string | null;
  snapshot: { items: PlannerItem[]; loading: boolean; error: string | null };
  listeners: Set<() => void>;
  users: number;
  stop: (() => void) | null;
  queue: OutboxOp[];
  persistTimer: ReturnType<typeof setTimeout> | null;
};
const shared = new Map<string, Shared>();
const PERSIST_DELAY_MS = 400;

function sharedFor(owner: string): Shared {
  let s = shared.get(owner);
  if (!s) {
    s = { items: [], loading: true, error: null, snapshot: { items: [], loading: true, error: null }, listeners: new Set(), users: 0, stop: null, queue: [], persistTimer: null };
    shared.set(owner, s);
  }
  return s;
}

function emit(s: Shared) {
  s.snapshot = { items: s.items, loading: s.loading, error: s.error };
  s.listeners.forEach((l) => l());
}

/** Saves the list to the device a moment after the last change (many quick changes, one write). */
function schedulePersist(owner: string) {
  const s = sharedFor(owner);
  if (s.persistTimer) clearTimeout(s.persistTimer);
  s.persistTimer = setTimeout(() => {
    s.persistTimer = null;
    void setItem(itemsCacheKey(owner), JSON.stringify(s.items));
  }, PERSIST_DELAY_MS);
}

function setShared(owner: string, patch: { items?: PlannerItem[]; loading?: boolean; error?: string | null }, persist = false) {
  const s = sharedFor(owner);
  if (patch.items !== undefined) s.items = patch.items;
  if (patch.loading !== undefined) s.loading = patch.loading;
  if (patch.error !== undefined) s.error = patch.error;
  emit(s);
  if (persist && patch.items !== undefined) schedulePersist(owner);
}

/** Starts the device cache load and the Firestore listener for `owner`; returns a function that stops them. */
function startSync(owner: string): () => void {
  const phoneVariants = getPhoneVariants(owner);
  const s = sharedFor(owner);

  let cancelled = false;
  let receivedSnapshot = false;
  // Until the server has answered once, snapshots come from Firestore's in-memory cache, which is empty after
  // a cold start offline. Don't let that wipe the items cached on the device.
  let serverSeen = false;
  let hadCache = false;
  let unsubscribeListener: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  setShared(owner, { loading: true });

  const handleUpdate = () => {
    getItem(itemsCacheKey(owner)).then((raw) => {
      const cached = parseCachedItems(raw);
      if (!cancelled && cached.length > 0) setShared(owner, { items: cached });
    });
  };
  const hasWindowEvents = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasWindowEvents) window.addEventListener('align_items_updated', handleUpdate);

  (async () => {
    const cached = parseCachedItems(await getItem(itemsCacheKey(owner)));
    if (!cancelled && !receivedSnapshot && cached.length > 0) {
      hadCache = true;
      setShared(owner, { items: overlay(cached, s.queue, COL), loading: false });
    }
  })();

  function subscribe() {
    if (cancelled) return;
    const variants = phoneVariants.length > 0 ? phoneVariants : [String(owner)];
    const q = query(collection(db, 'planner_items'), where('ownerId', 'in', variants));
    unsubscribeListener = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        retryCount = 0;
        if (!snapshot.metadata.fromCache) serverSeen = true;
        if (!serverSeen && (hadCache || snapshot.empty)) {
          // Offline cold start: keep the device cache on screen.
          setShared(owner, { loading: false });
          return;
        }
        // Only the pending/synced flags changed: the items themselves are the same, so skip the re-render.
        if (receivedSnapshot && snapshot.docChanges({ includeMetadataChanges: false }).length === 0) return;
        receivedSnapshot = true;
        const fetched: PlannerItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PlannerItem, 'id'>),
        }));
        // Server data with this device's unsynced changes on top.
        setShared(owner, { items: overlay(fetched, s.queue, COL), loading: false, error: null }, true);
      },
      (err) => {
        console.warn('Firestore items subscription notice:', err);
        setShared(owner, { error: 'Could not sync right now. Showing what\'s saved on this device; changes will sync later.', loading: false });
        if (!cancelled && retryCount < 5) {
          retryCount++;
          const delay = Math.min(1000 * retryCount, 4000);
          retryTimer = setTimeout(() => {
            if (unsubscribeListener) unsubscribeListener();
            subscribe();
          }, delay);
        }
      },
    );
  }

  const stopWaiting = whenSignedIn(() => subscribe());

  return () => {
    cancelled = true;
    if (hasWindowEvents && window.removeEventListener) window.removeEventListener('align_items_updated', handleUpdate);
    stopWaiting();
    if (retryTimer) clearTimeout(retryTimer);
    if (unsubscribeListener) unsubscribeListener();
  };
}

/** A screen starts using `owner`'s items; the first one starts syncing, the last one to leave stops it. */
function retain(owner: string) {
  const s = sharedFor(owner);
  s.users += 1;
  if (!s.stop) s.stop = startSync(owner);
  return () => {
    s.users -= 1;
    if (s.users === 0 && s.stop) {
      s.stop();
      s.stop = null;
    }
  };
}

function restartSync(owner: string) {
  const s = sharedFor(owner);
  if (s.stop) s.stop();
  s.stop = s.users > 0 ? startSync(owner) : null;
}

export function usePlannerItems(phone: string | null) {
  const owner = phone || 'guest';
  const { queue } = useOutbox(owner);
  const { items, loading, error } = useSyncExternalStore(
    useCallback((cb: () => void) => {
      const s = sharedFor(owner);
      s.listeners.add(cb);
      return () => { s.listeners.delete(cb); };
    }, [owner]),
    () => sharedFor(owner).snapshot,
    () => sharedFor(owner).snapshot,
  );

  useEffect(() => retain(owner), [owner]);

  // The queue may finish loading after the device cache: keep pending changes layered on top.
  useEffect(() => {
    const s = sharedFor(owner);
    if (s.queue === queue) return; // another screen already applied this queue
    s.queue = queue;
    if (queue.length) setShared(owner, { items: overlay(s.items, queue, COL) });
  }, [owner, queue]);

  const refresh = useCallback(() => restartSync(owner), [owner]);
  /** Optimistic change: applied to every screen at once and saved to the device shortly after. */
  const setItems = useCallback(
    (update: (prev: PlannerItem[]) => PlannerItem[]) => setShared(owner, { items: update(sharedFor(owner).items) }, true),
    [owner],
  );
  const setError = useCallback((e: string | null) => setShared(owner, { error: e }), [owner]);

  const toggleDone = useCallback(
    async (id: string, currentDone: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      triggerHaptic(currentDone ? 'light' : 'success');
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, done: !currentDone } : item));
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { done: !currentDone } });
    },
    [setItems, owner],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      triggerHaptic('medium');
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        return updated;
      });
      await pushOp(owner, { kind: 'delete', col: COL, id });
    },
    [setItems, owner],
  );

  const updateItem = useCallback(
    /** `quiet`: no haptic, for saves made while typing (notes). */
    async (id: string, patch: Partial<PlannerItem>, opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) triggerHaptic('success');
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: patch as Record<string, unknown> });
    },
    [setItems, owner]
  );

  const addSubtask = useCallback(
    async (taskId: string, title: string) => {
      setItems((prev) => {
        const updated = prev.map(item => {
          if (item.id !== taskId) return item;
          const subtasks = [...(item.subtasks || []), { title, done: false }];
          return { ...item, subtasks };
        });
        
        // Also fire off update to Firestore
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [setItems, owner]
  );

  const toggleSubtask = useCallback(
    async (taskId: string, subtaskIdx: number) => {
      setItems((prev) => {
        const updated = prev.map(item => {
          if (item.id !== taskId) return item;
          const subtasks = [...(item.subtasks || [])];
          subtasks[subtaskIdx] = { ...subtasks[subtaskIdx], done: !subtasks[subtaskIdx].done };
          return { ...item, subtasks };
        });
        
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [setItems, owner]
  );

  const deleteSubtask = useCallback(
    async (taskId: string, subtaskIdx: number) => {
      setItems((prev) => {
        const updated = prev.map(item => {
          if (item.id !== taskId) return item;
          const subtasks = (item.subtasks || []).filter((_, i) => i !== subtaskIdx);
          return { ...item, subtasks };
        });
        
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [setItems, owner]
  );

  const _saveNewItem = useCallback(
    async (newItem: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      const effectiveOwner = phone || 'guest';
      setError(null);
      
      // No haptics for generated items (vibration spam) or notes (saved while you type)
      if (!newItem.isGeneratedRecurring && newItem.type !== 'note') {
        triggerHaptic('success');
      }
      
      // The id is made on the device so the create can be replayed safely until the server confirms it.
      const id = newDocId(COL);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const localItem: PlannerItem = {
        id,
        ownerId: effectiveOwner,
        ...newItem,
        createdAt: new Date().toISOString(),
      };

      setItems((prev) => {
        const updated = [localItem, ...prev];
        return updated;
      });

      const { id: _omit, ...data } = localItem;
      void _omit;
      await pushOp(owner, { kind: 'set', col: COL, id, data: { ...data, createdAt: SERVER_TIMESTAMP } });
      return id;
    },
    [phone, setItems, setError, owner],
  );

  /** Moves tasks to a new day in one go (auto-push of overdue tasks); quiet, no haptics. */
  const moveTasks = useCallback(
    async (moves: { id: string; from: string }[], toDate: string) => {
      if (!moves.length) return;
      const byId = new Map(moves.map((m) => [m.id, m.from]));
      setItems((prev) => prev.map((item) => (byId.has(item.id) ? { ...item, dueDate: toDate, rolledOverFrom: byId.get(item.id) } : item)));
      await pushOps(owner, moves.map((m) => ({ kind: 'update' as const, col: COL, id: m.id, patch: { dueDate: toDate, rolledOverFrom: m.from } })));
    },
    [setItems, owner],
  );

  /** Adds many transactions under ids chosen by the caller (statement import), skipping none. */
  const importItems = useCallback(
    async (list: (Omit<PlannerItem, 'createdAt' | 'ownerId'> & { id: string })[]) => {
      if (!list.length) return;
      const effectiveOwner = phone || 'guest';
      const now = new Date().toISOString();
      const local: PlannerItem[] = list.map((it) => ({ ...it, ownerId: effectiveOwner, createdAt: now }));
      const ids = new Set(local.map((it) => it.id));
      setItems((prev) => {
        const updated = [...local, ...prev.filter((p) => !ids.has(p.id))];
        return updated;
      });
      await pushOps(owner, local.map(({ id, ...data }) => ({ kind: 'set' as const, col: COL, id, data: { ...data, createdAt: SERVER_TIMESTAMP } })));
    },
    [phone, setItems, owner],
  );

  const addTask = useCallback(
    async (input: { title: string; dueDate: string; reminderTime: string | null; priority?: string; subtasks?: import('./planner-item').PlannerSubtask[] }) => {
      return _saveNewItem({
        type: 'task',
        title: input.title,
        done: false,
        dueDate: input.dueDate,
        reminderTime: input.reminderTime,
        priority: input.priority || 'none',
        subtasks: input.subtasks || [],
      });
    },
    [_saveNewItem],
  );

  const addItem = useCallback(
    async (item: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      return _saveNewItem(item);
    },
    [_saveNewItem]
  );
  
  const addExpense = useCallback(
    async (input: { 
      title: string; 
      amount: number; 
      date: string; 
      category: string;
      isRecurring?: boolean;
      recurringFrequency?: 'monthly' | 'weekly' | 'yearly';
    }) => {
      return _saveNewItem({
        type: 'expense',
        title: input.title,
        amount: input.amount,
        date: input.date,
        category: input.category,
        tags: [input.category],
        splits: [],
        isRecurring: input.isRecurring,
        recurringFrequency: input.recurringFrequency,
      });
    },
    [_saveNewItem],
  );

  const addGoal = useCallback(
    async (input: { title: string; target: number; unit: string; date: string }) => {
      return _saveNewItem({
        type: 'goal',
        title: input.title,
        target: input.target,
        current: 0,
        unit: input.unit,
        date: input.date,
        progressHistory: [],
      });
    },
    [_saveNewItem],
  );

  const updateGoalProgress = useCallback(
    async (id: string, current: number, target: number) => {
      if (current >= target) return;
      const next = current + 1;
      const nowIso = new Date().toISOString();
      
      let history: { value: number; at: string }[] = [];
      setItems((prev) => {
        const updated = prev.map((item) => {
          if (item.id !== id) return item;
          history = [...(item.progressHistory || []), { value: next, at: nowIso }];
          return { ...item, current: next, progressHistory: history };
        });
        return updated;
      });

      // Full values rather than arrayUnion, so the queued write can be stored and replayed.
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { current: next, progressHistory: history } });
    },
    [setItems, owner]
  );

  const saveSplit = useCallback(
    async (id: string, splits: PlannerSplit[]) => {
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, splits } : item));
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { splits } });
    },
    [setItems, owner]
  );

  const toggleSplit = useCallback(
    async (expenseId: string, splitIdx: number, currentSplits: PlannerSplit[]) => {
      const newSplits = [...currentSplits];
      newSplits[splitIdx] = { ...newSplits[splitIdx], settled: !newSplits[splitIdx].settled };
      return saveSplit(expenseId, newSplits);
    },
    [saveSplit]
  );

  // --- AUTOMATED RECURRING BILLS INJECTION ---
  useEffect(() => {
    if (!phone || items.length === 0) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    for (const bill of billsToGenerate(items)) {
      const key = `${phone}:${(bill.title || '').trim().toLowerCase()}:${monthKey}`;
      if (attemptedBills.has(key)) continue;
      attemptedBills.add(key);
      _saveNewItem(bill).catch(console.warn);
    }
  }, [items, phone, _saveNewItem]);


  return { 
    items,
    loading, error, refresh,
    toggleDone, 
    deleteItem,
    updateItem,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addTask, 
    addItem, addExpense, addGoal, importItems, moveTasks,
    updateGoalProgress,
    saveSplit,
    toggleSplit
  };
}


export const DEFAULT_BUDGET_LIMITS: Record<string, number> = {
  MONTHLY: 20000, DAILY: 1000,
  '#Dining': 4000, '#Travel': 3000, '#Academics': 2000, '#General': 5000,
};

export function useBudgetLimits(phone: string | null) {
  const [budgetLimits, setBudgetLimits] = useState<Record<string, number>>(DEFAULT_BUDGET_LIMITS);

  useEffect(() => {
    const activePhone = phone;
    if (!activePhone) return;
    let cancelled = false;
    let unsubscribeListener: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    function subscribe() {
      if (cancelled) return;
      unsubscribeListener = onSnapshot(
        doc(db, 'planner_settings', `budgets_${activePhone}`),
        (snap) => {
          retryCount = 0;
          if (snap.exists()) {
            setBudgetLimits((prev) => ({ ...prev, ...(snap.data() as Record<string, number>) }));
          }
        },
        (err) => {
          console.warn('Budget subscription notice:', err);
          if (!cancelled && retryCount < 5) {
            retryCount++;
            retryTimer = setTimeout(() => {
              if (unsubscribeListener) unsubscribeListener();
              subscribe();
            }, Math.min(1000 * retryCount, 4000));
          }
        }
      );
    }

    const stopWaiting = whenSignedIn(() => subscribe());

    return () => {
      cancelled = true;
      stopWaiting();
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubscribeListener) unsubscribeListener();
    };
  }, [phone]);

  const saveBudgets = useCallback(async (updates: Record<string, number>) => {
    if (!phone) return;
    setBudgetLimits((prev) => ({ ...prev, ...updates }));
    await pushOp(phone, { kind: 'set', col: 'planner_settings', id: `budgets_${phone}`, data: updates, merge: true });
  }, [phone]);

  return { budgetLimits, saveBudgets, DEFAULT_BUDGET_LIMITS };
}
