import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  arrayUnion,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/lib/firebase';
import { type PlannerItem, type PlannerSplit } from '@/lib/planner-item';
import { getItem, itemsCacheKey, setItem } from '@/lib/storage';

function parseCachedItems(raw: string | null): PlannerItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usePlannerItems(phone: string | null) {
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!phone) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const cached = parseCachedItems(await getItem(itemsCacheKey(phone)));
      if (!cancelled && cached.length > 0) {
        setItems(cached);
      }
    })();

    const q = query(collection(db, 'planner_items'), where('ownerId', '==', String(phone)));
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fetched: PlannerItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PlannerItem, 'id'>),
        }));
        setItems((prev) => {
          const pendingLocals = prev.filter(
            (p) =>
              p.id.startsWith('local_') &&
              !fetched.some((f) => f.title === p.title && f.dueDate === p.dueDate && f.date === p.date),
          );
          const combined = [...pendingLocals, ...fetched];
          void setItem(itemsCacheKey(phone), JSON.stringify(combined));
          return combined;
        });
        setLoading(false);
      },
      (err) => {
        console.warn('Firestore items subscription notice:', err);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [phone]);

  const persistCache = useCallback(
    async (next: PlannerItem[]) => {
      if (phone) await setItem(itemsCacheKey(phone), JSON.stringify(next));
    },
    [phone],
  );

  const toggleDone = useCallback(
    async (id: string, currentDone: boolean) => {
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, done: !currentDone } : item));
        void persistCache(updated);
        return updated;
      });
      try {
        await updateDoc(doc(db, 'planner_items', id), { done: !currentDone });
      } catch (e) {
        console.warn('Toggled offline:', e);
      }
    },
    [persistCache],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        void persistCache(updated);
        return updated;
      });
      try {
        await deleteDoc(doc(db, 'planner_items', id));
      } catch (e) {
        console.warn('Deleted offline:', e);
      }
    },
    [persistCache],
  );

  const _saveNewItem = useCallback(
    async (newItem: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      if (!phone) return;
      const tempId = 'local_' + Date.now();
      const localItem: PlannerItem = {
        id: tempId,
        ownerId: phone,
        ...newItem,
        createdAt: new Date().toISOString(),
      };
      
      setItems((prev) => {
        const updated = [localItem, ...prev];
        void persistCache(updated);
        return updated;
      });
      
      try {
        const docRef = await addDoc(collection(db, 'planner_items'), {
          ...localItem,
          id: undefined, // let firestore assign id
          createdAt: serverTimestamp(),
        });
        setItems((prev) => {
          const updated = prev.map((it) => (it.id === tempId ? { ...it, id: docRef.id } : it));
          void persistCache(updated);
          return updated;
        });
      } catch (error) {
        console.warn('Saved offline in local cache (will sync when online):', error);
      }
    },
    [phone, persistCache],
  );

  const addTask = useCallback(
    async (input: { title: string; dueDate: string; reminderTime: string | null; priority?: string }) => {
      return _saveNewItem({
        type: 'task',
        title: input.title,
        done: false,
        dueDate: input.dueDate,
        reminderTime: input.reminderTime,
        priority: input.priority || 'none',
        subtasks: [],
      });
    },
    [_saveNewItem],
  );

  const addExpense = useCallback(
    async (input: { title: string; amount: number; date: string; category: string }) => {
      return _saveNewItem({
        type: 'expense',
        title: input.title,
        amount: input.amount,
        date: input.date,
        category: input.category,
        tags: [input.category],
        splits: [],
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
      
      setItems((prev) => {
        const updated = prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            current: next,
            progressHistory: [...(item.progressHistory || []), { value: next, at: nowIso }],
          };
        });
        void persistCache(updated);
        return updated;
      });
      
      try {
        await updateDoc(doc(db, 'planner_items', id), {
          current: next,
          progressHistory: arrayUnion({ value: next, at: nowIso })
        });
      } catch (e) {
        console.warn('Goal updated offline:', e);
      }
    },
    [persistCache]
  );

  const saveSplit = useCallback(
    async (id: string, splits: PlannerSplit[]) => {
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, splits } : item));
        void persistCache(updated);
        return updated;
      });
      try {
        await updateDoc(doc(db, 'planner_items', id), { splits });
      } catch (e) {
        console.warn('Split saved offline:', e);
      }
    },
    [persistCache]
  );

  const toggleSplit = useCallback(
    async (expenseId: string, splitIdx: number, currentSplits: PlannerSplit[]) => {
      const newSplits = [...currentSplits];
      newSplits[splitIdx] = { ...newSplits[splitIdx], settled: !newSplits[splitIdx].settled };
      return saveSplit(expenseId, newSplits);
    },
    [saveSplit]
  );

  return { 
    items, 
    loading, 
    toggleDone, 
    deleteItem, 
    addTask, 
    addExpense, 
    addGoal, 
    updateGoalProgress,
    saveSplit,
    toggleSplit
  };
}
