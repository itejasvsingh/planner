import { createHash } from 'node:crypto';
import { db } from './firebase';
import { loadSchemes, searchSchemes, type Scheme } from './amfi';
import { nameWords, type InvestEvent } from './investParse';

/**
 * Mutual fund confirmations read from SMS or email (lib/investParse.ts) become holdings that Align keeps up to date:
 * a purchase adds units and cost, a redemption removes units at the average cost. Only the fund and the numbers are kept,
 * never the message. Server-only, like the typed holdings: money_accounts/<phone>/holdings/auto_<fund> and
 * .../invest_events/<hash> (one per message, so a message read twice counts once).
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const root = (phone: string) => db.collection('money_accounts').doc(phone);

/** The AMFI scheme a message's fund name means: all its words, dropping trailing words until something matches. */
export async function findScheme(name: string): Promise<Scheme | null> {
  try {
    const all = await loadSchemes();
    const words = nameWords(name);
    for (let n = words.length; n >= 2; n--) {
      const hit = searchSchemes(all.values(), words.slice(0, n).join(' '), 1)[0];
      if (hit) return hit;
    }
  } catch {}
  return null;
}

export type InvestOutcome = 'added' | 'duplicate' | 'ignored';

export async function recordInvestment(phone: string, ev: InvestEvent, at: number): Promise<InvestOutcome> {
  const day = new Date(at + 5.5 * 3600_000).toISOString().slice(0, 10);
  const key = ev.ref ? `ref:${ev.ref}` : `${nameWords(ev.name).join(' ')}|${ev.kind}|${ev.amount}|${ev.units}|${day}`;
  const evRef = root(phone).collection('invest_events').doc(sha(key));
  if ((await evRef.get()).exists) return 'duplicate';

  const scheme = await findScheme(ev.name);
  const units = ev.units ?? (ev.amount && (ev.nav || scheme?.nav) ? ev.amount / (ev.nav || scheme!.nav) : null);
  if (!units || units <= 0) return 'ignored';
  const name = scheme ? `${scheme.name}` : ev.name;
  const id = `auto_${sha(scheme ? `code:${scheme.code}` : `name:${nameWords(ev.name).join(' ')}`).slice(0, 16)}`;
  const ref = root(phone).collection('holdings').doc(id);

  const result = await db.runTransaction(async (t) => {
    const [dup, snap] = await Promise.all([t.get(evRef), t.get(ref)]);
    if (dup.exists) return 'duplicate' as const;
    const cur = snap.data() as { units?: number | null; invested?: number } | undefined;
    const have = cur?.units || 0;
    const cost = cur?.invested || 0;
    let nextUnits: number;
    let nextCost: number;
    if (ev.kind === 'buy') {
      nextUnits = have + units;
      nextCost = cost + (ev.amount ?? units * (ev.nav || scheme?.nav || 0));
    } else {
      if (!cur || have <= 0) return 'ignored' as const; // sold something Align never saw bought
      const sold = Math.min(units, have);
      nextUnits = have - sold;
      nextCost = Math.max(0, cost - (cost / have) * sold);
    }
    t.set(evRef, { kind: ev.kind, units, amount: ev.amount, at, day });
    if (nextUnits < 0.001) t.delete(ref);
    else
      t.set(ref, {
        owner: 'me', type: 'mf', name, schemeCode: scheme?.code ?? null,
        units: Math.round(nextUnits * 1e4) / 1e4, invested: Math.round(nextCost * 100) / 100,
        price: null, value: scheme ? null : Math.round(nextCost * 100) / 100, rate: null, maturity: null,
        auto: true, asOf: Date.now(),
      });
    return 'added' as const;
  });
  return result;
}
