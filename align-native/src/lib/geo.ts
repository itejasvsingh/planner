import type { LatLng } from '@/lib/places';

/**
 * The phone's location, asked for only when you tap "Use my location". Web and the home-screen app use the browser's
 * own location (it asks for permission once). The Android app gets this in a later update (see geo.native.ts).
 */
export const geoSupported = () => typeof navigator !== 'undefined' && !!navigator.geolocation;

export function getPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) return reject(new Error('This device can’t share its location with Align.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(new Error(e.code === 1 ? 'Location is off for Align. Allow it in your phone or browser settings, then try again.' : 'Couldn’t get your location. Check that Location Services are on and try again.')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
