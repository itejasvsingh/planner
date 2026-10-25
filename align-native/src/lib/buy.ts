/**
 * "Buy later": things you want to remember to buy. Planner items of type 'buy' with a title, an optional price and
 * remind-on date, an optional shop, an optional pin (where to be reminded), and `done` once bought. Pure; no imports.
 */
export type BuyItem = {
  id: string;
  type?: string;
  title?: string;
  price?: number | null;
  remindOn?: string | null;
  shop?: string | null;
  place?: { lat: number; lng: number } | null;
  placeName?: string | null;
  done?: boolean;
  boughtTx?: string | null;
  createdAt?: unknown;
  createdDate?: string;
};

export const isBuy = (i: { type?: string }) => i.type === 'buy';
export const openBuys = <T extends BuyItem>(items: T[]) => items.filter(i => isBuy(i) && !i.done);
export const boughtBuys = <T extends BuyItem>(items: T[]) => items.filter(i => isBuy(i) && i.done);

const LEAD = /^\s*(?:please\s+)?(?:(?:remind me to |remember to |don'?t forget to |i need to |i have to |need to |have to )(?:buy|get|pick up|order|purchase)|(?:buy|purchase|pick up))\s+(?:some |a |an |the )?/i;

/** True for "buy milk", "remember to buy batteries", "pick up charger". */
export const looksLikeBuy = (text: string) => LEAD.test(text) && text.replace(LEAD, '').trim().length > 1;

/** "buy headphones 2000" / "buy milk ₹60" → title and price. */
export function parseBuyText(text: string): { title: string; price: number | null } {
  let rest = text.replace(LEAD, '').trim();
  let price: number | null = null;
  const m = rest.match(/(?:\s|^)(?:rs\.?|inr|₹)\s*(\d[\d,]*(?:\.\d+)?)\s*$|\s(\d[\d,]*(?:\.\d+)?)\s*(?:rs|rupees|₹)?\s*$/i);
  if (m && rest.slice(0, m.index).trim()) {
    price = Number((m[1] || m[2]).replace(/,/g, ''));
    rest = rest.slice(0, m.index).trim();
  }
  const title = rest.replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  return { title: title ? title[0].toUpperCase() + title.slice(1) : 'Something', price: price && price > 0 ? price : null };
}

const STOP = new Set(['the', 'and', 'for', 'new', 'some', 'with', 'from', 'pack', 'set']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

type Spend = { id: string; type?: string; title?: string; amount?: number | string; date?: string; excluded?: boolean };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * The spend (made on or after the day the item was added) that looks like buying it: the merchant is the item's shop, or
 * the item's own words appear in the merchant, or the amount is within 5% of the price you gave.
 */
export function matchPurchase(item: BuyItem, spends: Spend[]): Spend | null {
  const since = item.createdDate || '';
  const shop = words(item.shop || '');
  const own = words(item.title || '');
  for (const s of [...spends].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))) {
    if (s.type !== 'expense' || s.excluded || (since && (s.date || '') < since)) continue;
    const merchant = words(s.title || '');
    const byShop = shop.length > 0 && shop.some(w => merchant.includes(w));
    const byName = own.some(w => merchant.includes(w));
    const price = num(item.price);
    const byPrice = price > 0 && Math.abs(num(s.amount) - price) <= price * 0.05 && merchant.length > 0;
    if (byShop || byName || byPrice) return s;
  }
  return null;
}

const rad = (d: number) => (d * Math.PI) / 180;
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Open items pinned within `radius` metres of where you are. */
export const nearbyBuys = <T extends BuyItem>(items: T[], here: { lat: number; lng: number }, radius = 300) =>
  openBuys(items).filter(i => i.place && metresBetween(i.place, here) <= radius);

/** Open items whose remind-on day has come. */
export const dueBuys = <T extends BuyItem>(items: T[], today: string) => openBuys(items).filter(i => i.remindOn && i.remindOn <= today);

export const totalPrice = (items: BuyItem[]) => items.reduce((s, i) => s + num(i.price), 0);

/** The list as plain text to send on WhatsApp or anywhere (no account is shared). */
export function shareText(items: BuyItem[], name = 'Things to buy'): string {
  const lines = openBuys(items).map(i => `• ${i.title}${num(i.price) ? ` (₹${num(i.price).toLocaleString('en-IN')})` : ''}${i.shop ? ` at ${i.shop}` : ''}`);
  return lines.length ? `${name}:\n${lines.join('\n')}` : `${name}: nothing yet`;
}
