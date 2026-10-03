/**
 * Splitting an expense with friends, Splitwise-style.
 *
 * An expense's `amount` is always your own share (so budgets and analysis count only what you spent);
 * `split` remembers the whole bill: the total, who paid it, how it was divided and each friend's share.
 * - You paid: each friend owes you their share until it's settled.
 * - A friend paid: you owe that friend your share until you settle.
 * - Another friend paid: that's between them; it doesn't change what you and the others owe each other here.
 */

export type SplitMethod = 'equal' | 'exact' | 'percent';
export type SplitPerson = { name: string; share: number; percent?: number; settled?: boolean };
export type ExpenseSplit = {
  total: number;
  /** 'you' or a friend's name */
  paidBy: string;
  method: SplitMethod;
  yourShare: number;
  yourPercent?: number;
  /** Friends only (not you). */
  people: SplitPerson[];
  /** A friend paid and you've paid them back. */
  youSettled?: boolean;
};

export const YOU = 'you';

/** What the form holds while you edit a split: amounts and percentages as typed. */
export type SplitDraft = {
  friends: string[];
  paidBy: string;
  method: SplitMethod;
  /** name (or 'you') -> typed rupees, for 'exact' */
  exact: Record<string, string>;
  /** name (or 'you') -> typed percent, for 'percent' */
  percent: Record<string, string>;
};

export const emptyDraft = (): SplitDraft => ({ friends: [], paidBy: YOU, method: 'equal', exact: {}, percent: {} });

const paise = (n: number) => Math.round(n * 100);
const num = (s: string | undefined) => {
  const n = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Equal shares that add up to the total exactly; leftover paise go to the first people (you first). */
export function equalShares(total: number, count: number): number[] {
  if (count <= 0) return [];
  const p = paise(total);
  const base = Math.floor(p / count);
  let rest = p - base * count;
  return Array.from({ length: count }, () => (base + (rest-- > 0 ? 1 : 0)) / 100);
}

export type SplitResult = { split: ExpenseSplit; error?: undefined } | { split?: undefined; error: string };

/**
 * Turns the form into a split, or explains what doesn't add up.
 * `previous` keeps settled marks for friends who are still in the split.
 */
export function buildSplit(total: number, d: SplitDraft, previous?: ExpenseSplit | null): SplitResult {
  const friends = d.friends.map(f => f.trim()).filter(Boolean);
  if (!(total > 0)) return { error: 'Enter the total amount first' };
  if (!friends.length) return { error: 'Add at least one friend to split with' };
  const names = [YOU, ...friends];
  let shares: number[];
  let percents: number[] | undefined;
  if (d.method === 'equal') {
    shares = equalShares(total, names.length);
  } else if (d.method === 'exact') {
    shares = names.map(n => num(d.exact[n]));
    const diff = paise(total) - shares.reduce((s, x) => s + paise(x), 0);
    if (diff !== 0) return { error: diff > 0 ? `₹${fmt(diff / 100)} still to assign` : `₹${fmt(-diff / 100)} more than the total` };
  } else {
    percents = names.map(n => num(d.percent[n]));
    const sum = percents.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 100) > 0.01) return { error: sum < 100 ? `${fmt(100 - sum)}% still to assign` : `${fmt(sum - 100)}% over 100%` };
    // Friends' shares rounded to the paisa; you take what's left so it adds up exactly.
    const friendPaise = percents.slice(1).map(p => Math.round((paise(total) * p) / 100));
    shares = [(paise(total) - friendPaise.reduce((s, x) => s + x, 0)) / 100, ...friendPaise.map(x => x / 100)];
  }
  if (shares.some(s => s < 0)) return { error: 'Shares can’t be negative' };
  const paidBy = d.paidBy === YOU || friends.some(f => sameName(f, d.paidBy)) ? d.paidBy : YOU;
  const keepSettled = previous && previous.paidBy === paidBy;
  const split: ExpenseSplit = {
    total: paise(total) / 100,
    paidBy,
    method: d.method,
    yourShare: shares[0],
    ...(percents ? { yourPercent: percents[0] } : {}),
    people: friends.map((name, i) => {
      const before = keepSettled ? previous!.people.find(p => sameName(p.name, name)) : undefined;
      return {
        name,
        share: shares[i + 1],
        ...(percents ? { percent: percents[i + 1] } : {}),
        ...(before?.settled ? { settled: true } : {}),
      };
    }),
    ...(keepSettled && previous!.youSettled ? { youSettled: true } : {}),
  };
  return { split };
}

/** The form for an existing split, to edit it. */
export function draftFrom(s: ExpenseSplit): SplitDraft {
  const exact: Record<string, string> = { [YOU]: String(s.yourShare) };
  const percent: Record<string, string> = s.yourPercent !== undefined ? { [YOU]: String(s.yourPercent) } : {};
  for (const p of s.people) {
    exact[p.name] = String(p.share);
    if (p.percent !== undefined) percent[p.name] = String(p.percent);
  }
  return { friends: s.people.map(p => p.name), paidBy: s.paidBy, method: s.method, exact, percent };
}

type LegacySplit = { totalAmount?: number; splitWith?: string; yourShare?: number; paidBy?: string; settled?: boolean };
type WithSplit = { amount?: unknown; split?: unknown; splits?: { name: string; amount: number; settled?: boolean }[] | null };

/** The item's split in today's shape, also reading the two older shapes; null when it isn't split. */
export function splitOf(item: WithSplit): ExpenseSplit | null {
  const s = item.split as (ExpenseSplit & LegacySplit) | null | undefined;
  if (s && Array.isArray(s.people)) return s;
  if (s && s.splitWith) {
    // One friend: { totalAmount, splitWith, yourShare, paidBy: 'you' | 'them', settled }
    const total = Number(s.totalAmount) || 0;
    const yours = Number(s.yourShare) || 0;
    return {
      total,
      paidBy: s.paidBy === 'them' ? s.splitWith : YOU,
      method: 'exact',
      yourShare: yours,
      people: [{ name: s.splitWith, share: Math.max(0, paise(total - yours) / 100), settled: !!s.settled }],
      youSettled: !!s.settled,
    };
  }
  const list = (item.splits || []).filter(p => p && p.name);
  if (list.length) {
    // Older list of what each friend owes you on something you paid.
    const yours = Number(item.amount) || 0;
    const people = list.map(p => ({ name: p.name, share: Number(p.amount) || 0, settled: !!p.settled }));
    return { total: yours + people.reduce((t, p) => t + p.share, 0), paidBy: YOU, method: 'exact', yourShare: yours, people };
  }
  return null;
}

export type FriendEntry = { id: string; title: string; date: string; /** + they owe you, - you owe them */ amount: number };
export type FriendBalance = { name: string; net: number; open: FriendEntry[]; lastDate: string };

type Item = WithSplit & { id: string; type?: string; title?: string; date?: string | null };

/** What each friend owes you (positive) or you owe them (negative), from unsettled splits. */
export function friendBalances(items: Item[]): FriendBalance[] {
  const byKey = new Map<string, FriendBalance>();
  const entry = (name: string, date: string) => {
    const key = name.trim().toLowerCase();
    let b = byKey.get(key);
    if (!b) byKey.set(key, (b = { name: name.trim(), net: 0, open: [], lastDate: '' }));
    if (date >= b.lastDate) { b.lastDate = date; b.name = name.trim(); }
    return b;
  };
  for (const item of items) {
    if (item.type !== 'expense') continue;
    const s = splitOf(item);
    if (!s) continue;
    const date = item.date || '';
    for (const p of s.people) {
      const b = entry(p.name, date);
      let amount = 0;
      if (s.paidBy === YOU && !p.settled) amount = p.share;
      else if (sameName(s.paidBy, p.name) && !s.youSettled) amount = -s.yourShare;
      if (paise(amount) !== 0) {
        b.net = paise(b.net + amount) / 100;
        b.open.push({ id: item.id, title: item.title || 'Expense', date, amount });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.lastDate.localeCompare(a.lastDate));
}

/** Friends you've split with, most recent first, for one-tap adding. */
export function recentFriends(items: Item[]): string[] {
  return friendBalances(items)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
    .map(b => b.name);
}

/** The split updates that settle everything between you and `name`. */
export function settleUpPatches(items: Item[], name: string): { id: string; split: ExpenseSplit }[] {
  const out: { id: string; split: ExpenseSplit }[] = [];
  for (const item of items) {
    if (item.type !== 'expense') continue;
    const s = splitOf(item);
    if (!s || !s.people.some(p => sameName(p.name, name))) continue;
    let changed = false;
    const people = s.people.map(p => {
      if (s.paidBy === YOU && sameName(p.name, name) && !p.settled) { changed = true; return { ...p, settled: true }; }
      return p;
    });
    const youSettled = sameName(s.paidBy, name) && !s.youSettled ? (changed = true) : s.youSettled;
    if (changed) out.push({ id: item.id, split: { ...s, people, ...(youSettled ? { youSettled: true } : {}) } });
  }
  return out;
}

/** "Rahul owes you ₹400" lines for the form. */
export function describeSplit(s: ExpenseSplit): string[] {
  if (s.paidBy === YOU) return s.people.filter(p => p.share > 0).map(p => `${p.name} owes you ₹${fmt(p.share)}`);
  return s.yourShare > 0 ? [`You owe ${s.paidBy} ₹${fmt(s.yourShare)}`] : [];
}

export function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
