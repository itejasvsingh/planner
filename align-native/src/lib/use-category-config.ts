import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { usePhone } from '@/lib/phone-context';
import { getItem, setItem } from '@/lib/storage';
import type { CategoryConfig } from '@/lib/categories';
import { pushOp } from '@/lib/outbox';

/** Field inside planner_settings/preferences_<phone>. */
const FIELD = 'expenseCategories';
const cacheKey = (phone: string) => `align_category_config_${phone}`;

// One shared subscription per phone, so every sheet and screen sees the same config without extra listeners.
type Entry = { config: CategoryConfig; listeners: Set<() => void>; unsubscribe?: () => void; refs: number };
const store = new Map<string, Entry>();
const EMPTY: CategoryConfig = {};

function entryFor(phone: string): Entry {
  let e = store.get(phone);
  if (!e) {
    e = { config: EMPTY, listeners: new Set(), refs: 0 };
    store.set(phone, e);
  }
  return e;
}

function publish(phone: string, config: CategoryConfig) {
  const e = entryFor(phone);
  e.config = config;
  e.listeners.forEach(l => l());
}

function retain(phone: string) {
  const e = entryFor(phone);
  e.refs += 1;
  if (e.unsubscribe) return;
  // Show the last known config right away (offline / slow network), then follow Firestore.
  void getItem(cacheKey(phone)).then(raw => {
    if (!raw || e.config !== EMPTY) return;
    try { publish(phone, JSON.parse(raw)); } catch { /* ignore a corrupt cache */ }
  });
  e.unsubscribe = onSnapshot(
    doc(db, 'planner_settings', `preferences_${phone}`),
    snap => {
      const next = (snap.exists() && (snap.data()?.[FIELD] as CategoryConfig)) || EMPTY;
      publish(phone, next);
      void setItem(cacheKey(phone), JSON.stringify(next));
    },
    err => console.warn('Category config subscription notice:', err),
  );
}

function release(phone: string) {
  const e = store.get(phone);
  if (!e) return;
  e.refs -= 1;
  if (e.refs <= 0 && e.unsubscribe) {
    e.unsubscribe();
    e.unsubscribe = undefined;
  }
}

/** The user's category edits (custom categories, renames, icons, hidden) and a saver. */
export function useCategoryConfig() {
  const { phone } = usePhone();
  const key = phone || 'guest';

  useEffect(() => {
    retain(key);
    return () => release(key);
  }, [key]);

  const config = useSyncExternalStore(
    cb => {
      const e = entryFor(key);
      e.listeners.add(cb);
      return () => e.listeners.delete(cb);
    },
    () => entryFor(key).config,
    () => entryFor(key).config,
  );

  /** Replaces the whole config (callers build the next value from the current one). */
  const saveConfig = useCallback(async (next: CategoryConfig) => {
    // JSON round-trip drops undefined values, which Firestore rejects.
    const clean: CategoryConfig = JSON.parse(JSON.stringify(next));
    publish(key, clean);
    void setItem(cacheKey(key), JSON.stringify(clean));
    // mergeFields replaces this one field wholesale (merge: true would deep-merge its maps, so removed
    // renames/icons would never be deleted) while leaving the rest of the preferences doc alone.
    // Queued like every other write, so category edits made offline sync later.
    await pushOp(key, { kind: 'set', col: 'planner_settings', id: `preferences_${key}`, data: { [FIELD]: clean }, mergeFields: [FIELD] });
  }, [key]);

  return { config, saveConfig };
}
