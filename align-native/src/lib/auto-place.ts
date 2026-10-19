import { geoSupported, getPosition } from '@/lib/geo';
import { autoPinEnabled, nearestSaved } from '@/lib/places-store';
import type { LatLng } from '@/lib/places';

/**
 * Where you are right now, for pinning a new expense. Never throws: with automatic pinning off, no location
 * permission, or no fix it resolves to null and the expense is simply saved without a place (add or change it later).
 */
export async function autoPlace(): Promise<{ place: LatLng; placeName?: string } | null> {
  try {
    if (!geoSupported() || !(await autoPinEnabled())) return null;
    const place = await getPosition();
    const near = await nearestSaved(place);
    return near ? { place, placeName: near.name } : { place };
  } catch {
    return null;
  }
}
