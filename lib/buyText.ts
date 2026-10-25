/**
 * Reading "buy batteries" / "remember to buy milk 60" for the WhatsApp bot. Must match align-native/src/lib/buy.ts
 * (tests/buy.test.cjs checks they agree). No imports.
 */
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

