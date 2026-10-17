import * as Location from 'expo-location';
import type { LatLng } from '@/lib/places';

/**
 * The phone's location in the Android app, asked for only when you tap "Use my location" on a transaction
 * (while-in-use permission; nothing runs in the background).
 */
export const geoSupported = () => true;

export async function getPosition(): Promise<LatLng> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location is off for Align. Allow it in your phone’s settings, then try again.');
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    throw new Error('Couldn’t get your location. Check that Location is on and try again.');
  }
}
