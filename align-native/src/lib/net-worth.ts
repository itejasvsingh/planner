/**
 * Net worth from what Align can see (bank balances you've ticked in, what's owed on credit cards) plus the things you
 * add by hand. Pure, so tests can load it directly.
 */
export type NetEntry = { id: string; name: string; kind: 'asset' | 'liability'; value: number; at?: number };

type Acct = { balance: number; excluded?: boolean };
type Card = { outstanding: number; hidden?: boolean };

export type NetWorth = {
  bank: number;
  owedOnCards: number;
  assets: number;
  liabilities: number;
  net: number;
  customAssets: NetEntry[];
  customLiabilities: NetEntry[];
};

/** Keeps only well-formed entries (an old cached copy or a half-saved one never breaks the screen). */
export const validEntries = (entries: unknown): NetEntry[] =>
  (Array.isArray(entries) ? entries : []).filter(
    (e): e is NetEntry => !!e && typeof e.id === 'string' && typeof e.name === 'string' && (e.kind === 'asset' || e.kind === 'liability') && Number.isFinite(e.value) && e.value >= 0,
  );

export function netWorth(accounts: Acct[], cards: Card[], entries: unknown): NetWorth {
  const list = validEntries(entries);
  const bank = accounts.reduce((t, a) => t + (a.excluded ? 0 : a.balance), 0);
  const owedOnCards = cards.reduce((t, c) => t + (c.hidden ? 0 : c.outstanding || 0), 0);
  const customAssets = list.filter(e => e.kind === 'asset');
  const customLiabilities = list.filter(e => e.kind === 'liability');
  const assets = bank + customAssets.reduce((t, e) => t + e.value, 0);
  const liabilities = owedOnCards + customLiabilities.reduce((t, e) => t + e.value, 0);
  return { bank, owedOnCards, assets, liabilities, net: assets - liabilities, customAssets, customLiabilities };
}
