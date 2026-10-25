import { useEffect, useSyncExternalStore } from 'react';
import { getItem, setItem } from '@/lib/storage';

/** "Show labels on transactions" (the Transfer / Left out tags): off by default, saved on this device. */
const KEY = 'align_show_labels';
let on = false;
let loaded = false;
const listeners = new Set<() => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try { on = (await getItem(KEY)) === 'on'; listeners.forEach(l => l()); } catch { /* keep default */ }
}

export async function setShowLabels(v: boolean): Promise<void> {
  await load();
  on = v;
  listeners.forEach(l => l());
  await setItem(KEY, v ? 'on' : 'off');
}

export function useShowLabels(): boolean {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => on, () => on);
}
