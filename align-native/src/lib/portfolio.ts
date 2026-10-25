/**
 * Investments: what you (and, as holdings you type in yourself, your family) own, valued today. Pure (no imports), tested in
 * tests/portfolio.test.cjs. A holding's value comes from, in order: units × the live price (mutual funds, from the public AMFI
 * daily NAV list), units × a price you typed, or a value you typed. Gain needs what you put in ("invested").
 */
export type HoldingType = 'mf' | 'stock' | 'fd' | 'gold' | 'ppf' | 'crypto' | 'other';
export type Holding = {
  id: string;
  /** 'me', or the name of the family member these belong to (you type it in; accounts aren't connected) */
  owner: string;
  type: HoldingType;
  name: string;
  /** What was put in, in rupees (0 or missing: gain isn't shown) */
  invested: number;
  units?: number | null;
  /** Price per unit you typed (stocks, gold per gram, crypto); mutual funds use the live NAV instead */
  price?: number | null;
  /** The value you typed, for things with no unit price (an FD, PPF, a flat share) */
  value?: number | null;
  /** AMFI scheme code, for a mutual fund valued live */
  schemeCode?: string | null;
  /** FD/PPF: interest rate (%) and maturity (YYYY-MM-DD), shown only */
  rate?: number | null;
  maturity?: string | null;
  asOf?: number;
};
export type Nav = { nav: number; date: string };

export const ME = 'me';
export const TYPE_LABEL: Record<HoldingType, string> = {
  mf: 'Mutual funds', stock: 'Stocks', fd: 'Fixed deposits', gold: 'Gold', ppf: 'PPF / EPF / NPS', crypto: 'Crypto', other: 'Other',
};
export const TYPE_ORDER: HoldingType[] = ['mf', 'stock', 'fd', 'ppf', 'gold', 'crypto', 'other'];

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

export type Valued = Holding & { current: number; source: 'nav' | 'price' | 'manual'; navDate?: string; gain: number | null; gainPct: number | null };

export function valueHolding(h: Holding, navs: Record<string, Nav> = {}): Valued {
  const nav = h.type === 'mf' && h.schemeCode ? navs[h.schemeCode] : undefined;
  let current = 0;
  let source: Valued['source'] = 'manual';
  let navDate: string | undefined;
  if (nav && num(h.units) > 0) { current = num(h.units) * nav.nav; source = 'nav'; navDate = nav.date; }
  else if (num(h.units) > 0 && num(h.price) > 0) { current = num(h.units) * num(h.price); source = 'price'; }
  else current = num(h.value);
  current = r2(current);
  const invested = num(h.invested);
  const gain = invested > 0 ? r2(current - invested) : null;
  return { ...h, current, source, ...(navDate ? { navDate } : {}), gain, gainPct: gain !== null ? Math.round((gain / invested) * 1000) / 10 : null };
}

export type Summary = {
  total: number;
  invested: number;
  /** Only over holdings that have an invested amount, so a holding without one doesn't fake a gain */
  gain: number;
  gainPct: number | null;
  byType: { type: HoldingType; total: number; pct: number; count: number }[];
  byOwner: { owner: string; total: number; count: number }[];
  holdings: Valued[];
};

/** `owner`: only that owner's holdings ('me' or a family name); null/undefined: everyone's. */
export function summarize(holdings: Holding[], navs: Record<string, Nav> = {}, owner?: string | null): Summary {
  const all = holdings.map(h => valueHolding(h, navs));
  const shown = owner ? all.filter(h => (h.owner || ME) === owner) : all;
  const total = r2(shown.reduce((t, h) => t + h.current, 0));
  const withCost = shown.filter(h => num(h.invested) > 0);
  const cost = r2(withCost.reduce((t, h) => t + num(h.invested), 0));
  const worth = r2(withCost.reduce((t, h) => t + h.current, 0));
  const types = new Map<HoldingType, { total: number; count: number }>();
  for (const h of shown) { const e = types.get(h.type) || { total: 0, count: 0 }; e.total += h.current; e.count += 1; types.set(h.type, e); }
  const owners = new Map<string, { total: number; count: number }>();
  for (const h of all) { const k = h.owner || ME; const e = owners.get(k) || { total: 0, count: 0 }; e.total += h.current; e.count += 1; owners.set(k, e); }
  return {
    total,
    invested: r2(shown.reduce((t, h) => t + num(h.invested), 0)),
    gain: r2(worth - cost),
    gainPct: cost > 0 ? Math.round(((worth - cost) / cost) * 1000) / 10 : null,
    byType: TYPE_ORDER.filter(t => types.has(t)).map(t => ({ type: t, total: r2(types.get(t)!.total), pct: total > 0 ? Math.round((types.get(t)!.total / total) * 1000) / 10 : 0, count: types.get(t)!.count })),
    byOwner: [...owners.entries()].map(([o, e]) => ({ owner: o, total: r2(e.total), count: e.count })).sort((a, b) => (a.owner === ME ? -1 : b.owner === ME ? 1 : b.total - a.total)),
    holdings: shown.sort((a, b) => b.current - a.current),
  };
}

export type WholeNetWorth = {
  net: number;
  lines: { key: string; label: string; value: number; sign: 1 | -1 }[];
};

/**
 * Everything together: your banks, your investments, optionally your family's holdings, and the other assets you added,
 * less what you owe on cards and any liabilities you added.
 */
export function wholeNetWorth(p: { banks: number; owedOnCards: number; otherAssets: number; liabilities: number; mine: number; family: number }, includeFamily: boolean): WholeNetWorth {
  const lines = [
    { key: 'banks', label: 'Bank accounts', value: p.banks, sign: 1 as const },
    { key: 'mine', label: 'My investments', value: p.mine, sign: 1 as const },
    ...(includeFamily ? [{ key: 'family', label: 'Family’s investments', value: p.family, sign: 1 as const }] : []),
    { key: 'other', label: 'Other assets you added', value: p.otherAssets, sign: 1 as const },
    { key: 'cards', label: 'Credit card dues', value: p.owedOnCards, sign: -1 as const },
    { key: 'liab', label: 'Loans and other dues', value: p.liabilities, sign: -1 as const },
  ].filter(l => l.value !== 0 || l.key === 'banks' || l.key === 'mine');
  return { net: r2(lines.reduce((t, l) => t + l.sign * l.value, 0)), lines };
}
