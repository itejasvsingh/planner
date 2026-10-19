/**
 * Where you spend: places you pin on a transaction (latitude/longitude, kept with the transaction), places you name
 * once ("Office", "Cafe on 5th"), and spending grouped by place or by shop. Pure (no imports), tested in
 * tests/places.test.cjs. Nothing here leaves the phone: no address lookup (the map only asks a tile server for the picture of the area in view).
 */
export type LatLng = { lat: number; lng: number };
export type SavedPlace = LatLng & { id: string; name: string };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const isLatLng = (p: unknown): p is LatLng => !!p && typeof (p as LatLng).lat === 'number' && typeof (p as LatLng).lng === 'number' && Number.isFinite((p as LatLng).lat) && Number.isFinite((p as LatLng).lng);

/** The saved place within `radius` metres of `pos` (the closest one), if any. */
export function nearestPlace(saved: SavedPlace[], pos: LatLng, radius = 150): SavedPlace | null {
  let best: SavedPlace | null = null;
  let bestD = radius;
  for (const p of saved) {
    const d = distanceM(p, pos);
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Opens the spot in the phone's maps app or the browser's map. */
export const mapsUrl = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// About 200 m: unnamed pins this close count as the same spot
const CELL = 0.002;
const cellOf = (p: LatLng) => ({ x: Math.round(p.lat / CELL), y: Math.round(p.lng / CELL) });

export type Spot = { key: string; name: string; named: boolean; total: number; count: number; ids: string[]; lat?: number; lng?: number };
type Spend = { id: string; title?: string; amount?: number | string | null; place?: unknown; placeName?: string | null };
const amt = (t: Spend) => { const n = Number(t.amount); return Number.isFinite(n) ? n : 0; };

/** Spending by place: named places by name; pins without a name by ~200 m spot. Biggest first. */
export function spendByPlace(items: Spend[]): Spot[] {
  const map = new Map<string, Spot>();
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const t of items) {
    const name = (t.placeName || '').trim();
    let key: string;
    let label: string;
    if (name) { key = `n:${name.toLowerCase()}`; label = name; }
    else if (isLatLng(t.place)) { const c = cellOf(t.place); key = `c:${c.x}:${c.y}`; label = 'Unnamed spot'; }
    else continue;
    const e = map.get(key) || { key, name: label, named: !!name, total: 0, count: 0, ids: [] };
    e.total = Math.round((e.total + amt(t)) * 100) / 100;
    e.count += 1;
    e.ids.push(t.id);
    if (isLatLng(t.place)) { sums.set(key, { lat: (sums.get(key)?.lat || 0) + t.place.lat, lng: (sums.get(key)?.lng || 0) + t.place.lng, n: (sums.get(key)?.n || 0) + 1 }); }
    map.set(key, e);
  }
  for (const [key, e] of map) { const m = sums.get(key); if (m) { e.lat = m.lat / m.n; e.lng = m.lng / m.n; } }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Spending by shop (the transaction's title, spelled alike): works for every transaction, with or without a pin. */
export function spendByShop(items: Spend[]): { key: string; name: string; total: number; count: number }[] {
  const map = new Map<string, { key: string; names: Map<string, number>; total: number; count: number }>();
  for (const t of items) {
    const title = (t.title || '').trim();
    const key = norm(title);
    if (!key) continue;
    const e = map.get(key) || { key, names: new Map(), total: 0, count: 0 };
    e.names.set(title, (e.names.get(title) || 0) + 1);
    e.total = Math.round((e.total + amt(t)) * 100) / 100;
    e.count += 1;
    map.set(key, e);
  }
  return [...map.values()]
    .map(e => ({ key: e.key, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], total: e.total, count: e.count }))
    .sort((a, b) => b.total - a.total);
}

/** The centre of the pins in one unnamed spot, to save it as a named place. */
export function spotCentre(items: Spend[], ids: string[]): LatLng | null {
  const pts = items.filter(t => ids.includes(t.id) && isLatLng(t.place)).map(t => t.place as LatLng);
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

// ---- Map maths (Web Mercator, 256px tiles) ----
const TILE = 256;
const clampLat = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat));
/** World pixel position of a point at a zoom level. */
export function worldPx(p: LatLng, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const s = Math.sin(rad(clampLat(p.lat)));
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function fromWorldPx(x: number, y: number, z: number): LatLng {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}
/** Centre and zoom that fit every point inside a w x h view with `pad` px around. One point: a street-level zoom. */
export function fitView(points: LatLng[], w: number, h: number, pad = 36): { center: LatLng; zoom: number } {
  if (!points.length) return { center: { lat: 20.5937, lng: 78.9629 }, zoom: 4 };
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  for (let z = 17; z >= 2; z--) {
    const px = points.map(p => worldPx(p, z));
    const xs = px.map(p => p.x), ys = px.map(p => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= w - 2 * pad && Math.max(...ys) - Math.min(...ys) <= h - 2 * pad) return { center, zoom: z };
  }
  return { center, zoom: 2 };
}
/** Tiles covering a w x h view, each with its offset inside the view. */
export function tilesFor(center: LatLng, zoom: number, w: number, h: number): { x: number; y: number; z: number; left: number; top: number }[] {
  const c = worldPx(center, zoom);
  const x0 = c.x - w / 2, y0 = c.y - h / 2;
  const max = 2 ** zoom;
  const out: { x: number; y: number; z: number; left: number; top: number }[] = [];
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++) {
    if (ty < 0 || ty >= max) continue;
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++) {
      out.push({ x: ((tx % max) + max) % max, y: ty, z: zoom, left: tx * TILE - x0, top: ty * TILE - y0 });
    }
  }
  return out;
}
/** Pixel position of a point inside the view. */
export function pointInView(p: LatLng, center: LatLng, zoom: number, w: number, h: number): { x: number; y: number } {
  const a = worldPx(p, zoom), c = worldPx(center, zoom);
  return { x: a.x - c.x + w / 2, y: a.y - c.y + h / 2 };
}
