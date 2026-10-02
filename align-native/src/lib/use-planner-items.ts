import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import { db } from '@/lib/firebase';
import { type PlannerItem, type PlannerSplit } from '@/lib/planner-item';
import { getItem, itemsCacheKey, setItem } from '@/lib/storage';
import { triggerHaptic } from '@/lib/haptics';
import { LayoutAnimation } from 'react-native';
import { getPhoneVariants } from '@/lib/phone';
import { billsToGenerate } from '@/lib/recurring';
import { newDocId, pushOp, pushOps, useOutbox } from '@/lib/outbox';
import { overlay, SERVER_TIMESTAMP } from '@/lib/outbox-core';

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

export function usePlannerItems(phone: string | null) {
  const owner = phone || 'guest';
  const { queue } = useOutbox(owner);
  // Latest unconfirmed writes, for layering on top of whatever the server sends.
  const queueRef = useRef(queue);
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const currentPhone: string = phone || 'guest';
    const phoneVariants = getPhoneVariants(currentPhone);

    let cancelled = false;
    let receivedSnapshot = false;
    // Until the server has answered once, snapshots come from Firestore's in-memory cache, which is empty after
    // a cold start offline. Don't let that wipe the items cached on the device.
    let serverSeen = false;
    let hadCache = false;
    let unsubscribeListener: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    setLoading(true);

    const handleUpdate = () => {
      getItem(itemsCacheKey(currentPhone)).then((raw) => {
        const cached = parseCachedItems(raw);
        if (!cancelled && cached.length > 0) {
          setItems(cached);
        }
      });
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      if (typeof window.addEventListener === 'function') window.addEventListener('align_items_updated', handleUpdate);
    }

    (async () => {
      const cached = parseCachedItems(await getItem(itemsCacheKey(currentPhone)));
      if (!cancelled && !receivedSnapshot && cached.length > 0) {
        hadCache = true;
        setItems(overlay(cached, queueRef.current, COL));
        setLoading(false);
      }
    })();

    function subscribe() {
      if (cancelled) return;
      const variants = phoneVariants.length > 0 ? phoneVariants : [String(currentPhone)];
      const q = query(collection(db, 'planner_items'), where('ownerId', 'in', variants));
      unsubscribeListener = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snapshot) => {
          retryCount = 0;
          if (!snapshot.metadata.fromCache) serverSeen = true;
          if (!serverSeen && (hadCache || snapshot.empty)) {
            // Offline cold start: keep the device cache on screen.
            setLoading(false);
            return;
          }
          receivedSnapshot = true;
          setError(null);
          const fetched: PlannerItem[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PlannerItem, 'id'>),
          }));
          // Server data with this device's unsynced changes on top.
          const combined = overlay(fetched, queueRef.current, COL);
          void setItem(itemsCacheKey(currentPhone), JSON.stringify(combined));
          setItems(combined);
          setLoading(false);
        },
        (err) => {
          console.warn('Firestore items subscription notice:', err);
          setError('Could not sync right now. Showing what\'s saved on this device; changes will sync later.');
          setLoading(false);
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

    subscribe();

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('align_items_updated', handleUpdate);
      }
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubscribeListener) unsubscribeListener();
    };
  }, [phone, refreshKey]);

  // The queue is shared by every screen, and it may finish loading after the device cache: keep pending changes
  // (including ones made from another screen's copy of this hook) layered on top.
  useEffect(() => {
    queueRef.current = queue;
    if (queue.length) setItems((prev) => overlay(prev, queue, COL));
  }, [queue]);

  const persistCache = useCallback(
    async (next: PlannerItem[]) => {
      const effectiveKey = phone || 'guest';
      await setItem(itemsCacheKey(effectiveKey), JSON.stringify(next));
    },
    [phone],
  );

  const toggleDone = useCallback(
    async (id: string, currentDone: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      triggerHaptic(currentDone ? 'light' : 'success');
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, done: !currentDone } : item));
        void persistCache(updated);
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { done: !currentDone } });
    },
    [persistCache, owner],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      triggerHaptic('medium');
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        void persistCache(updated);
        return updated;
      });
      await pushOp(owner, { kind: 'delete', col: COL, id });
    },
    [persistCache, owner],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<PlannerItem>) => {
      triggerHaptic('success');
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
        void persistCache(updated);
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: patch as Record<string, unknown> });
    },
    [persistCache, owner]
  );

  const addSubtask = useCallback(
    async (taskId: string, title: string) => {
      setItems((prev) => {
        const updated = prev.map(item => {
          if (item.id !== taskId) return item;
          const subtasks = [...(item.subtasks || []), { title, done: false }];
          return { ...item, subtasks };
        });
        void persistCache(updated);
        
        // Also fire off update to Firestore
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [persistCache, owner]
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
        void persistCache(updated);
        
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [persistCache, owner]
  );

  const deleteSubtask = useCallback(
    async (taskId: string, subtaskIdx: number) => {
      setItems((prev) => {
        const updated = prev.map(item => {
          if (item.id !== taskId) return item;
          const subtasks = (item.subtasks || []).filter((_, i) => i !== subtaskIdx);
          return { ...item, subtasks };
        });
        void persistCache(updated);
        
        const nextItem = updated.find(i => i.id === taskId);
        if (nextItem) void pushOp(owner, { kind: 'update', col: COL, id: taskId, patch: { subtasks: nextItem.subtasks } });
        
        return updated;
      });
    },
    [persistCache, owner]
  );

  const _saveNewItem = useCallback(
    async (newItem: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      const effectiveOwner = phone || 'guest';
      setError(null);
      
      // Don't trigger haptics for generated items to avoid vibration spam
      if (!newItem.isGeneratedRecurring) {
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
        void persistCache(updated);
        return updated;
      });

      const { id: _omit, ...data } = localItem;
      void _omit;
      await pushOp(owner, { kind: 'set', col: COL, id, data: { ...data, createdAt: SERVER_TIMESTAMP } });
    },
    [phone, persistCache, owner],
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
        void persistCache(updated);
        return updated;
      });
      await pushOps(owner, local.map(({ id, ...data }) => ({ kind: 'set' as const, col: COL, id, data: { ...data, createdAt: SERVER_TIMESTAMP } })));
    },
    [phone, persistCache, owner],
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
        void persistCache(updated);
        return updated;
      });

      // Full values rather than arrayUnion, so the queued write can be stored and replayed.
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { current: next, progressHistory: history } });
    },
    [persistCache, owner]
  );

  const saveSplit = useCallback(
    async (id: string, splits: PlannerSplit[]) => {
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, splits } : item));
        void persistCache(updated);
        return updated;
      });
      await pushOp(owner, { kind: 'update', col: COL, id, patch: { splits } });
    },
    [persistCache, owner]
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

  const settleUpWith = useCallback(async (personName: string) => {
    triggerHaptic('medium');
    const toUpdate = items.filter(
      (item) => item.type === 'expense' && item.splits?.some((s) => s.name === personName && !s.settled)
    );
    const ids = new Set(toUpdate.map(i => i.id));
    setItems(prev => {
      const updated = prev.map(item => ids.has(item.id)
        ? { ...item, splits: (item.splits ?? []).map(s => (s.name === personName ? { ...s, settled: true } : s)) }
        : item);
      void persistCache(updated);
      return updated;
    });
    for (const item of toUpdate) {
      const newSplits = (item.splits ?? []).map((s) => (s.name === personName ? { ...s, settled: true } : s));
      await pushOp(owner, { kind: 'update', col: COL, id: item.id, patch: { splits: newSplits } });
    }
  }, [items, owner, persistCache]);

  return { 
    items, settleUpWith, 
    loading, error, refresh,
    toggleDone, 
    deleteItem,
    updateItem,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addTask, 
    addItem, addExpense, addGoal, importItems,
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

    subscribe();

    return () => {
      cancelled = true;
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
