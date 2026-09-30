import { useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Shared between the tab screens (which scroll) and the QuickAddBar (rendered once in the tabs layout)
let collapsed = false;
let lastY = 0;
const listeners = new Set<() => void>();

function setCollapsed(next: boolean) {
  if (next === collapsed) return;
  collapsed = next;
  listeners.forEach((l) => l());
}

export function useQuickAddCollapsed() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => collapsed,
    () => collapsed,
  );
}

export function expandQuickAdd() {
  lastY = 0;
  setCollapsed(false);
}

/** onScroll for tab screens: shrink the quick-add bar while scrolling down, restore on scroll up or near the top. */
export function collapseQuickAddOnScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
  const y = e.nativeEvent.contentOffset.y;
  const dy = y - lastY;
  lastY = y;
  if (y < 40) setCollapsed(false);
  else if (dy > 6) setCollapsed(true);
  else if (dy < -6) setCollapsed(false);
}
