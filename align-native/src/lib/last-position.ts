import type { LatLng } from '@/lib/places';

/** Where the phone last was, without asking for permission or starting location (web: unknown). */
export async function lastPosition(): Promise<LatLng | null> {
  return null;
}
