import type { AccountBalance, CardSummary } from '@/lib/gmail-connect';

/**
 * Bank balances and card amounts owed, brought up to date: the server holds the last balance an alert quoted, and
 * anything recorded since then (by the item's date and time) is applied on top. One place, so the Cards page and the
 * Money overview always show the same total.
 */
type Item = { type?: string; cardLast4?: string | null; date?: string | null; time?: string | null; amount?: number | string | null };

type Named = { last4?: string | null; bankName?: string; issuerName?: string; name?: string };
// Same keys the Cards page always matched on: an account by its digits or bank, a card by its digits or issuer
const accountId = (x: Named) => x.last4 || x.bankName || x.name;
const cardId = (x: Named) => x.last4 || x.issuerName || x.name;

function stamp(item: Item): number | null {
  if (!item.date) return null;
  const d = new Date(item.date);
  if (Number.isNaN(d.getTime())) return null;
  const m = item.time ? /^(\d{2}):(\d{2})$/.exec(item.time) : null;
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

export function adjustBalances(baseAccounts: AccountBalance[], baseCards: CardSummary[], items: Item[]) {
  const accounts = baseAccounts.map(a => ({ ...a }));
  const cards = baseCards.map(c => ({ ...c }));
  for (const item of items) {
    if (!item.cardLast4) continue;
    const ts = stamp(item);
    if (ts === null) continue;
    const amt = Number(item.amount) || 0;
    const acc = accounts.find(a => accountId(a) === item.cardLast4);
    if (acc && ts > acc.at) {
      if (item.type === 'expense') acc.balance -= amt;
      if (item.type === 'income' || item.type === 'deposit') acc.balance += amt;
    }
    const card = cards.find(c => cardId(c as unknown as Named) === item.cardLast4);
    if (card && ts > card.paidSince) {
      if (item.type === 'expense') card.outstanding = (card.outstanding || 0) + amt;
      if (item.type === 'income' || item.type === 'transfer' || item.type === 'deposit') card.outstanding = Math.max(0, (card.outstanding || 0) - amt);
    }
  }
  // Accounts the user unticked stay listed but are left out of the total (and so of net worth)
  const totalBalance = accounts.reduce((t, a) => t + (a.excluded ? 0 : a.balance), 0);
  const netWorth = totalBalance - cards.reduce((t, c) => t + (c.outstanding || 0), 0);
  return { accounts, cards, totalBalance, netWorth };
}

/** The newest few items recorded against one account. */
export function recentForAccount<T extends Item>(account: Named, items: T[], n = 3): T[] {
  const id = accountId(account);
  return items
    .filter(i => i.cardLast4 === id && (i.type === 'expense' || i.type === 'income' || i.type === 'deposit' || i.type === 'transfer'))
    .sort((a, b) => (stamp(b) ?? 0) - (stamp(a) ?? 0))
    .slice(0, n);
}

/**
 * Total across the ticked accounts, one point a day, oldest first. Each account carries its last known balance forward
 * between its own points (and before its first one, so a newly seen account doesn't make a false jump), and the line
 * ends today at the current adjusted total. Fewer than two points when there's no history yet.
 */
export function totalSeries(
  accounts: { balance: number; excluded?: boolean; history?: { d: string; b: number }[] }[],
  todayKey: string,
): { d: string; b: number }[] {
  const used = accounts.filter(a => !a.excluded && Array.isArray(a.history) && a.history.length > 0);
  const days = [...new Set(used.flatMap(a => (a.history || []).map(h => h.d)))].filter(d => d <= todayKey).sort();
  if (!days.length) return [];
  const out = days.map(d => ({
    d,
    b: used.reduce((sum, a) => {
      const h = a.history as { d: string; b: number }[];
      let v = h[0].b;
      for (const p of h) { if (p.d <= d) v = p.b; else break; }
      return sum + v;
    }, 0),
  }));
  // Accounts with no history yet still count in today's total
  const total = accounts.reduce((t, a) => t + (a.excluded ? 0 : a.balance), 0);
  if (out[out.length - 1].d === todayKey) out[out.length - 1].b = total;
  else out.push({ d: todayKey, b: total });
  return out;
}
