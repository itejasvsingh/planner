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
  setDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/lib/firebase';
import { type PlannerItem, type PlannerSplit } from '@/lib/planner-item';
import { getItem, itemsCacheKey, setItem } from '@/lib/storage';
import { triggerHaptic } from '@/lib/haptics';

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
      triggerHaptic(currentDone ? 'light' : 'success');
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
      triggerHaptic('medium');
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

  const updateItem = useCallback(
    async (id: string, patch: Partial<PlannerItem>) => {
      triggerHaptic('success');
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
        void persistCache(updated);
        return updated;
      });
      try {
        await updateDoc(doc(db, 'planner_items', id), patch);
      } catch (e) {
        console.warn('Updated offline:', e);
      }
    },
    [persistCache]
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
        if (nextItem && !taskId.startsWith('local_')) {
          updateDoc(doc(db, 'planner_items', taskId), { subtasks: nextItem.subtasks }).catch(console.warn);
        }
        
        return updated;
      });
    },
    [persistCache]
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
        if (nextItem && !taskId.startsWith('local_')) {
          updateDoc(doc(db, 'planner_items', taskId), { subtasks: nextItem.subtasks }).catch(console.warn);
        }
        
        return updated;
      });
    },
    [persistCache]
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
        if (nextItem && !taskId.startsWith('local_')) {
          updateDoc(doc(db, 'planner_items', taskId), { subtasks: nextItem.subtasks }).catch(console.warn);
        }
        
        return updated;
      });
    },
    [persistCache]
  );

  const _saveNewItem = useCallback(
    async (newItem: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      if (!phone) return;
      
      // Don't trigger haptics for generated items to avoid vibration spam
      if (!newItem.isGeneratedRecurring) {
        triggerHaptic('success');
      }
      
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

  // --- AUTOMATED RECURRING BILLS INJECTION ---
  useEffect(() => {
    if (!phone || items.length === 0) return;
    
    // Only run if we actually have templates, avoids thrashing
    const recurringTemplates = items.filter(it => it.type === 'expense' && it.isRecurring && !it.isGeneratedRecurring);
    if (recurringTemplates.length === 0) return;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const currentMonthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const todayStr = `${currentMonthKey}-${pad(now.getDate())}`;

    const newItemsToInject: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>[] = [];
    
    recurringTemplates.forEach(rec => {
      const hasThisMonth = items.some(it =>
        it.type === 'expense' &&
        (it.id === rec.id || it.recurringParentId === rec.id) &&
        (it.date || '').startsWith(currentMonthKey)
      );

      const recDate = rec.date || '';
      if (!hasThisMonth && !recDate.startsWith(currentMonthKey)) {
        const originalDay = recDate.length >= 10 ? recDate.slice(8, 10) : '01';
        const billDate = `${currentMonthKey}-${originalDay}`;

        newItemsToInject.push({
          type: 'expense',
          title: rec.title,
          amount: rec.amount,
          date: billDate <= todayStr ? billDate : `${currentMonthKey}-01`,
          category: rec.category || '#Bills',
          tags: rec.tags || ['#Bills'],
          splits: [],
          isRecurring: true,
          isGeneratedRecurring: true,
          recurringParentId: rec.id,
          recurringFrequency: rec.recurringFrequency || 'monthly'
        });
      }
    });

    if (newItemsToInject.length > 0) {
      newItemsToInject.forEach(item => {
        _saveNewItem(item).catch(console.warn);
      });
    }
  }, [items, phone, _saveNewItem]);

  const settleUpWith = useCallback(async (personName: string) => {
    triggerHaptic('medium');
    const toUpdate = items.filter(
      (item) => item.type === 'expense' && item.splits?.some((s) => s.name === personName && !s.settled)
    );
    await Promise.all(
      toUpdate.map((item) => {
        const newSplits = (item.splits ?? []).map((s) =>
          s.name === personName ? { ...s, settled: true } : s
        );
        return updateDoc(doc(db, 'planner_items', item.id), { splits: newSplits });
      })
    );
  }, [items]);

  return { 
    items, settleUpWith, 
    loading, 
    toggleDone, 
    deleteItem,
    updateItem,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addTask, 
    addExpense, 
    addGoal, 
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
    if (!phone) return;
    const unsubscribe = onSnapshot(doc(db, 'planner_settings', `budgets_${phone}`), (snap) => {
      if (snap.exists()) {
        setBudgetLimits((prev) => ({ ...prev, ...(snap.data() as Record<string, number>) }));
      }
    });
    return () => unsubscribe();
  }, [phone]);

  const saveBudgets = useCallback(async (updates: Record<string, number>) => {
    if (!phone) return;
    setBudgetLimits(updates);
    await setDoc(doc(db, 'planner_settings', `budgets_${phone}`), updates, { merge: true });
  }, [phone]);

  return { budgetLimits, saveBudgets, DEFAULT_BUDGET_LIMITS };
}
