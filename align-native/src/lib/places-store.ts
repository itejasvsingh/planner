import { useEffect, useSyncExternalStore } from 'react';
import { getItem, setItem } from '@/lib/storage';
import { distanceM, isLatLng, type LatLng, type SavedPlace } from '@/lib/places';

/**
 * Places you've named, kept on this device only (not synced anywhere). Shown as one-tap chips on a transaction, and
 * used to name a new pin that lands within about 150 m of one.
 */
const KEY = 'align_saved_places';
let places: SavedPlace[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    places = Array.isArray(parsed) ? parsed.filter((p: SavedPlace) => p && typeof p.name === 'string' && isLatLng(p)) : [];
    emit();
  } catch { /* start empty */ }
}

export function usePlaces(): SavedPlace[] {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => places,
    () => places,
  );
}

/** Saves a named place unless one with that name is already within 150 m. */
export async function savePlace(name: string, at: LatLng): Promise<void> {
  await load();
  const n = name.trim().slice(0, 40);
  if (!n || places.some(p => p.name.toLowerCase() === n.toLowerCase() && distanceM(p, at) <= 150)) return;
  places = [...places, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, lat: at.lat, lng: at.lng }].slice(-50);
  emit();
  await setItem(KEY, JSON.stringify(places));
}
