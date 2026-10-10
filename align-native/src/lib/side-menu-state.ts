import { useSyncExternalStore } from 'react';

// Opened by the avatar button in every tab header; the menu itself is rendered once in the tabs layout
let open = false;
const listeners = new Set<() => void>();

export function setSideMenuOpen(next: boolean) {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l());
}

export function useSideMenuOpen() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => open,
    () => open,
  );
}
