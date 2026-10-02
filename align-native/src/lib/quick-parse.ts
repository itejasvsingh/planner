/**
 * Fallback for AI quick-add when the server can't be reached: turns the text into a simple expense or task on
 * the device. Pure (no imports) so tests can load it directly (see tests/quick-parse.test.cjs).
 */

export type QuickDraft =
  | { type: 'expense'; title: string; amount: number; date: string; category: string; tags: string[]; splits: [] }
  | { type: 'task'; title: string; dueDate: string; done: false; priority: 'none'; subtasks: [] };

const CURRENCY_AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\b|rupees\b|inr\b)/i;
const SPEND_WORDS = /\b(spent|paid|pay|bought|buy|cost|bill|for|on)\b/i;
const TRAILING_AMOUNT = /(?:^|\s)([\d,]{2,}(?:\.\d{1,2})?)\s*$/;
const LEADING_AMOUNT = /^\s*([\d,]{2,}(?:\.\d{1,2})?)\s+(?=\D)/;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '');
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function parseOffline(text: string, today: string): QuickDraft {
  const raw = clean(text);
  let amount: number | null = null;
  let rest = raw;

  const cur = raw.match(CURRENCY_AMOUNT);
  if (cur) {
    amount = Number((cur[1] || cur[2]).replace(/,/g, ''));
    rest = raw.replace(cur[0], ' ');
  } else {
    // "lunch 250" / "250 lunch": a bare number counts as money only next to other words.
    const tail = raw.match(TRAILING_AMOUNT);
    const head = raw.match(LEADING_AMOUNT);
    const hit = tail && raw.slice(0, tail.index).trim() ? tail : head && raw.slice(head[0].length).trim() ? head : null;
    if (hit && (SPEND_WORDS.test(raw) || raw.split(' ').length <= 4)) {
      amount = Number(hit[1].replace(/,/g, ''));
      rest = raw.replace(hit[0], ' ');
    }
  }

  if (amount && amount > 0) {
    const title = capitalize(clean(rest.replace(/\b(spent|paid|on|for)\b/gi, ' '))) || 'Expense';
    return { type: 'expense', title, amount, date: today, category: 'Other', tags: ['Other'], splits: [] };
  }
  return { type: 'task', title: capitalize(raw) || 'Task', dueDate: today, done: false, priority: 'none', subtasks: [] };
}
