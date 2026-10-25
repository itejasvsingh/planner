/**
 * Mutual fund prices from AMFI's public daily NAV list (https://portal.amfiindia.com/spages/NAVAll.txt, about 14,000
 * schemes, updated every evening). Read on the server and kept in memory for six hours. No imports, so tests can load it.
 * Format: `Scheme Code;ISIN payout/growth;ISIN reinvest;Scheme Name;Plan;Option;Net Asset Value;Date`.
 */
export type Scheme = { code: string; name: string; plan: string; option: string; nav: number; date: string };

const URL_ = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const KEEP_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; schemes: Map<string, Scheme> } | null = null;

export function parseNavAll(text: string): Scheme[] {
  const out: Scheme[] = [];
  for (const line of String(text || '').split('\n')) {
    const p = line.trim().split(';');
    if (p.length < 8 || !/^\d{4,8}$/.test(p[0])) continue;
    const nav = parseFloat(p[6]);
    if (!(nav > 0)) continue; // "N.A." and blanks
    out.push({ code: p[0], name: p[3].trim(), plan: p[4].trim(), option: p[5].trim(), nav, date: p[7].trim() });
  }
  return out;
}

/** Schemes whose name, plan and option contain every word typed; Growth plans first, then shortest names. */
export function searchSchemes(schemes: Iterable<Scheme>, query: string, limit = 15): Scheme[] {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Scheme[] = [];
  for (const s of schemes) {
    const hay = `${s.name} ${s.plan} ${s.option}`.toLowerCase();
    if (words.every(w => hay.includes(w))) hits.push(s);
  }
  return hits
    .sort((a, b) => Number(/growth/i.test(b.option)) - Number(/growth/i.test(a.option)) || a.name.length - b.name.length)
    .slice(0, limit);
}

/** The whole list (memory-cached six hours; the last good copy is used if AMFI can't be reached). */
export async function loadSchemes(now = Date.now(), fetcher: typeof fetch = fetch): Promise<Map<string, Scheme>> {
  if (cache && now - cache.at < KEEP_MS) return cache.schemes;
  try {
    const res = await fetcher(URL_, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'AlignPlanner/1.0' } });
    if (!res.ok) throw new Error(`AMFI ${res.status}`);
    const list = parseNavAll(await res.text());
    if (list.length < 1000) throw new Error('AMFI list looked wrong');
    cache = { at: now, schemes: new Map(list.map(s => [s.code, s])) };
  } catch (e) {
    console.warn('AMFI prices not refreshed:', (e as Error).message);
    if (!cache) return new Map();
  }
  return cache.schemes;
}

export const resetAmfiCache = () => { cache = null; };

/** The latest NAV for each scheme code that exists. */
export async function navsFor(codes: string[], now = Date.now(), fetcher: typeof fetch = fetch): Promise<Record<string, { nav: number; date: string }>> {
  const wanted = [...new Set(codes.filter(Boolean))];
  if (!wanted.length) return {};
  const all = await loadSchemes(now, fetcher);
  const out: Record<string, { nav: number; date: string }> = {};
  for (const c of wanted) { const s = all.get(c); if (s) out[c] = { nav: s.nav, date: s.date }; }
  return out;
}
