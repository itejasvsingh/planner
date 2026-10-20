/**
 * Splitting an expense with friends, Splitwise-style.
 *
 * An expense's `amount` is always your own share (so budgets and analysis count only what you spent);
 * `split` remembers the whole bill: the total, who paid it, how it was divided and each friend's share.
 * - You paid: each friend owes you their share until it's settled.
 * - A friend paid: you owe that friend your share until you settle.
 * - Another friend paid: that's between them; it doesn't change what you and the others owe each other here.
 */

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';
export type SplitPerson = {
  name: string; share: number; percent?: number; /** 'shares' method: this person's number of shares */ shares?: number;
  settled?: boolean;
  /** Part of `share` paid back so far (you paid, they're paying you in instalments). */
  paid?: number;
};
export type ExpenseSplit = {
  total: number;
  /** 'you' or a friend's name */
  paidBy: string;
  method: SplitMethod;
  yourShare: number;
  yourPercent?: number;
  yourShares?: number;
  /** Friends only (not you). */
  people: SplitPerson[];
  /** A friend paid and you've paid them back. */
  youSettled?: boolean;
  /** Part of `yourShare` you've paid back to the friend who paid. */
  youPaid?: number;
  /** A trip, a flat, a group of friends: splits with the same group are totalled together. */
  group?: string;
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
  /** name (or 'you') -> typed number of shares, for 'shares' (blank = 1) */
  shares?: Record<string, string>;
  group?: string;
};

export const emptyDraft = (): SplitDraft => ({ friends: [], paidBy: YOU, method: 'equal', exact: {}, percent: {}, shares: {}, group: '' });

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

/** Shares in proportion to `weights` that add up to the total exactly; leftover paise go to the first people (you first). */
export function weightedShares(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const p = paise(total);
  const base = weights.map(w => Math.floor((p * w) / sum));
  let rest = p - base.reduce((s, x) => s + x, 0);
  return base.map(x => (x + (rest-- > 0 ? 1 : 0)) / 100);
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
  let weights: number[] | undefined;
  if (d.method === 'equal') {
    shares = equalShares(total, names.length);
  } else if (d.method === 'exact') {
    shares = names.map(n => num(d.exact[n]));
    const diff = paise(total) - shares.reduce((s, x) => s + paise(x), 0);
    if (diff !== 0) return { error: diff > 0 ? `₹${fmt(diff / 100)} still to assign` : `₹${fmt(-diff / 100)} more than the total` };
  } else if (d.method === 'shares') {
    // A blank box counts as one share; zero is allowed (someone who only shares nothing is just not in it)
    weights = names.map(n => (String(d.shares?.[n] ?? '').trim() === '' ? 1 : num(d.shares?.[n])));
    if (weights.some(w => w < 0)) return { error: 'Shares can’t be negative' };
    if (!(weights.reduce((s, w) => s + w, 0) > 0)) return { error: 'Give at least one person a share' };
    shares = weightedShares(total, weights);
  } else {
    percents = names.map(n => num(d.percent[n]));
    const sum = percents.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 100) > 0.01) return { error: sum < 100 ? `${fmt(100 - sum)}% still to assign` : `${fmt(sum - 100)}% over 100%` };
    // Friends' shares rounded to the paisa; you take what's left so it adds up exactly.
    const friendPaise = percents.slice(1).map(p => Math.round((paise(total) * p) / 100));
    shares = [(paise(total) - friendPaise.reduce((s, x) => s + x, 0)) / 100, ...friendPaise.map(x => x / 100)];
  }
  if (shares.some(s => s < 0)) return { error: 'Shares can’t be negative' };
  const group = (d.group || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const paidBy = d.paidBy === YOU || friends.some(f => sameName(f, d.paidBy)) ? d.paidBy : YOU;
  const keepSettled = previous && previous.paidBy === paidBy;
  const split: ExpenseSplit = {
    total: paise(total) / 100,
    paidBy,
    method: d.method,
    yourShare: shares[0],
    ...(percents ? { yourPercent: percents[0] } : {}),
    ...(weights ? { yourShares: weights[0] } : {}),
    ...(group ? { group } : {}),
    people: friends.map((name, i) => {
      const before = keepSettled ? previous!.people.find(p => sameName(p.name, name)) : undefined;
      const paid = before?.paid ? Math.min(before.paid, shares[i + 1]) : 0;
      return {
        name,
        share: shares[i + 1],
        ...(percents ? { percent: percents[i + 1] } : {}),
        ...(weights ? { shares: weights[i + 1] } : {}),
        ...(before?.settled ? { settled: true } : {}),
        ...(paid > 0 && !before?.settled ? { paid } : {}),
      };
    }),
    ...(keepSettled && previous!.youSettled ? { youSettled: true } : {}),
    ...(keepSettled && previous!.youPaid && !previous!.youSettled ? { youPaid: Math.min(previous!.youPaid, shares[0]) } : {}),
  };
  return { split };
}

/** The form for an existing split, to edit it. */
export function draftFrom(s: ExpenseSplit): SplitDraft {
  const exact: Record<string, string> = { [YOU]: String(s.yourShare) };
  const percent: Record<string, string> = s.yourPercent !== undefined ? { [YOU]: String(s.yourPercent) } : {};
  const shares: Record<string, string> = s.yourShares !== undefined ? { [YOU]: String(s.yourShares) } : {};
  for (const p of s.people) {
    exact[p.name] = String(p.share);
    if (p.percent !== undefined) percent[p.name] = String(p.percent);
    if (p.shares !== undefined) shares[p.name] = String(p.shares);
  }
  return { friends: s.people.map(p => p.name), paidBy: s.paidBy, method: s.method, exact, percent, shares, group: s.group || '' };
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
      if (s.paidBy === YOU && !p.settled) amount = paise(p.share - (p.paid || 0)) / 100;
      else if (sameName(s.paidBy, p.name) && !s.youSettled) amount = -paise(s.yourShare - (s.youPaid || 0)) / 100;
      if (paise(amount) !== 0) {
        b.net = paise(b.net + amount) / 100;
        b.open.push({ id: item.id, title: item.title || 'Expense', date, amount });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.lastDate.localeCompare(a.lastDate));
}

export type HistoryEntry = {
  id: string; title: string; date: string;
  /** The whole share on that expense: + they owe you, - you owe them */
  amount: number;
  /** How much of it has been paid back */
  paid: number;
  status: 'open' | 'part' | 'settled';
  group?: string;
};

/** Every split you have with `name`, newest first, open or settled. */
export function friendHistory(items: Item[], name: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const item of items) {
    if (item.type !== 'expense') continue;
    const s = splitOf(item);
    if (!s) continue;
    const date = item.date || '';
    const base = { id: item.id, title: item.title || 'Expense', date, ...(s.group ? { group: s.group } : {}) };
    for (const p of s.people) {
      if (!sameName(p.name, name)) continue;
      if (s.paidBy === YOU && p.share > 0) {
        const paid = p.settled ? p.share : Math.min(p.paid || 0, p.share);
        out.push({ ...base, amount: p.share, paid, status: p.settled ? 'settled' : paid > 0 ? 'part' : 'open' });
      } else if (sameName(s.paidBy, name) && s.yourShare > 0) {
        const paid = s.youSettled ? s.yourShare : Math.min(s.youPaid || 0, s.yourShare);
        out.push({ ...base, amount: -s.yourShare, paid, status: s.youSettled ? 'settled' : paid > 0 ? 'part' : 'open' });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
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

/**
 * A payment of `amount` between you and `name` (they pay you back when they owe you, you pay them when you owe them):
 * the oldest open splits are paid off first; the last one can be part-paid. Returns what was applied (never more than owed).
 */
export function settleAmountPatches(items: (Item & { date?: string | null })[], name: string, amount: number): { applied: number; patches: { id: string; split: ExpenseSplit }[] } {
  const bal = friendBalances(items).find(b => sameName(b.name, name));
  if (!bal || paise(bal.net) === 0 || !(amount > 0)) return { applied: 0, patches: [] };
  const theyOwe = bal.net > 0;
  let left = Math.min(paise(amount), Math.abs(paise(bal.net)));
  const applied = left / 100;
  const byId = new Map(items.map(i => [i.id, i]));
  const order = bal.open.filter(e => (e.amount > 0) === theyOwe).sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, ExpenseSplit>();
  for (const e of order) {
    if (left <= 0) break;
    const item = byId.get(e.id);
    const s0 = item && splitOf(item);
    if (!s0) continue;
    const s = out.get(e.id) || s0;
    const owed = paise(Math.abs(e.amount));
    const pay = Math.min(left, owed);
    left -= pay;
    const full = pay >= owed;
    if (theyOwe) {
      out.set(e.id, { ...s, people: s.people.map(p => (sameName(p.name, name) ? (full ? { ...p, settled: true } : { ...p, paid: paise((p.paid || 0) + pay / 100) / 100 }) : p)) });
    } else {
      out.set(e.id, full ? { ...s, youSettled: true } : { ...s, youPaid: paise((s.youPaid || 0) + pay / 100) / 100 });
    }
  }
  return { applied, patches: [...out].map(([id, split]) => ({ id, split })) };
}

/** The group names used on your splits, most recent first. */
export function groupNames(items: Item[]): string[] {
  const seen = new Map<string, { name: string; date: string }>();
  for (const item of items) {
    const g = splitOf(item)?.group;
    if (!g) continue;
    const key = g.toLowerCase();
    const prev = seen.get(key);
    const date = item.date || '';
    if (!prev || date >= prev.date) seen.set(key, { name: g, date });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date)).map(x => x.name);
}

/** Only the splits tagged with `group` (or the ones with no group when `group` is ''), to see one group's balances. */
export function inGroup<T extends Item>(items: T[], group: string): T[] {
  return items.filter(i => {
    const g = splitOf(i)?.group || '';
    return sameName(g, group);
  });
}

/** What the open splits in each group add up to: + you're owed, − you owe. */
export function groupTotals(items: Item[]): { name: string; net: number; friends: number }[] {
  return groupNames(items).map(name => {
    const bal = friendBalances(inGroup(items, name));
    return { name, net: bal.reduce((t, b) => t + paise(b.net), 0) / 100, friends: bal.filter(b => paise(b.net) !== 0).length };
  });
}

/**
 * The form for the newest split in `group`: the same friends, who paid and how it was divided, as a starting point
 * (amounts are not carried over: they belong to the old bill). Null when the group has no split yet.
 */
export function groupDefaultDraft(items: (Item & { createdAt?: unknown })[], group: string): SplitDraft | null {
  let best: { s: ExpenseSplit; date: string } | null = null;
  for (const item of items) {
    const s = splitOf(item);
    if (!s || !s.group || !sameName(s.group, group)) continue;
    const date = item.date || '';
    if (!best || date >= best.date) best = { s, date };
  }
  if (!best) return null;
  const d = draftFrom(best.s);
  // Equal and by-shares splits carry over; fixed amounts and percents only mean something for that one bill
  return { ...d, exact: {}, percent: d.method === 'percent' ? d.percent : {}, method: d.method === 'exact' ? 'equal' : d.method };
}

/** A short message to send a friend who owes you, listing what it's for. */
export function reminderText(b: FriendBalance): string {
  const owed = b.open.filter(e => e.amount > 0);
  const total = owed.reduce((t, e) => t + paise(e.amount), 0) / 100;
  if (!(total > 0)) return '';
  const lines = owed.slice(0, 6).map(e => `• ${e.title}: ₹${fmt(e.amount)}`);
  const more = owed.length > 6 ? [`• and ${owed.length - 6} more`] : [];
  return [`Hi ${b.name}, a quick reminder: you owe me ₹${fmt(total)}.`, ...lines, ...more, 'Thanks!'].join('\n');
}

/** "Rahul owes you ₹400" lines for the form. */
export function describeSplit(s: ExpenseSplit): string[] {
  if (s.paidBy === YOU) return s.people.filter(p => p.share > 0).map(p => `${p.name} owes you ₹${fmt(p.share)}`);
  return s.yourShare > 0 ? [`You owe ${s.paidBy} ₹${fmt(s.yourShare)}`] : [];
}

export function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
