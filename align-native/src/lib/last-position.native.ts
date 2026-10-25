import * as Location from 'expo-location';
import type { LatLng } from '@/lib/places';

/** Where the phone last was, only if Align already has location permission (never asks, never runs in the background). */
export async function lastPosition(): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000 });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch {
    return null;
  }
}
