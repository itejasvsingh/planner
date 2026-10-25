import { db, FieldValue } from './firebase';
import type { Holding, HoldingType } from '../align-native/src/lib/portfolio';

/**
 * Investment holdings you (and, typed in by you and labelled with their name, your family) keep in Align. Server-only, like
 * the rest of the money data: money_accounts/<phone>/holdings/<id>. Valued in the app with lib/portfolio.ts.
 */
export const MAX_HOLDINGS = 300;
const TYPES: HoldingType[] = ['mf', 'stock', 'fd', 'gold', 'ppf', 'crypto', 'other'];
const col = (phone: string) => db.collection('money_accounts').doc(phone).collection('holdings');

const money = (v: unknown, max = 1e11) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 1e4) / 1e4 : undefined);

/** Checks and trims one holding from the app; `undefined` fields are left out, so a bad number is an error, not a silent 0. */
export function cleanHolding(x: Record<string, unknown>): { ok: true; holding: Omit<Holding, 'id'> } | { ok: false; error: string } {
  const type = TYPES.includes(x.type as HoldingType) ? (x.type as HoldingType) : null;
  if (!type) return { ok: false, error: 'Pick a type.' };
  const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!name) return { ok: false, error: 'Give it a name.' };
  const owner = x.owner === undefined || x.owner === 'me' || x.owner === '' ? 'me' : typeof x.owner === 'string' && /^[A-Za-z][A-Za-z .'-]{0,29}$/.test(x.owner.trim()) ? x.owner.trim() : null;
  if (!owner) return { ok: false, error: 'Use a name with letters only.' };
  const invested = money(x.invested);
  const units = money(x.units, 1e12);
  const price = money(x.price);
  const value = money(x.value);
  if ([invested, units, price, value].some(v => v === undefined)) return { ok: false, error: 'Numbers only, and not negative.' };
  const code = x.schemeCode === null || x.schemeCode === undefined || x.schemeCode === '' ? null : typeof x.schemeCode === 'string' && /^\d{4,8}$/.test(x.schemeCode) ? x.schemeCode : undefined;
  if (code === undefined) return { ok: false, error: 'That fund code looks wrong.' };
  const rate = x.rate === null || x.rate === undefined || x.rate === '' ? null : typeof x.rate === 'number' && x.rate >= 0 && x.rate <= 100 ? x.rate : undefined;
  if (rate === undefined) return { ok: false, error: 'Interest rate is a percent between 0 and 100.' };
  const maturity = x.maturity === null || x.maturity === undefined || x.maturity === '' ? null : typeof x.maturity === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.maturity) ? x.maturity : undefined;
  if (maturity === undefined) return { ok: false, error: 'Maturity date should look like 2027-03-05.' };
  // Something must say what it is worth: units with a fund code or a price, or a typed value
  const worthKnown = (units && (price || (type === 'mf' && code))) || value;
  if (!worthKnown) return { ok: false, error: type === 'mf' ? 'Add the units and pick the fund, or type its current value.' : 'Add the units and price, or type its current value.' };
  return { ok: true, holding: { owner, type, name, invested: invested || 0, units, price, value, schemeCode: code, rate, maturity } };
}

export async function listHoldings(phone: string): Promise<Holding[]> {
  const snap = await col(phone).get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Holding, 'id'>) })).sort((a, b) => (a.asOf || 0) - (b.asOf || 0));
}

/** Adds (no id) or replaces one holding; returns its id. */
export async function saveHolding(phone: string, h: Omit<Holding, 'id'>, id?: string): Promise<string> {
  if (!id && (await col(phone).count().get()).data().count >= MAX_HOLDINGS) throw new Error(`You can keep up to ${MAX_HOLDINGS} holdings.`);
  const ref = id ? col(phone).doc(id) : col(phone).doc();
  if (id && !(await ref.get()).exists) throw new Error('That holding is gone.');
  await ref.set({ ...h, asOf: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  return ref.id;
}

export async function removeHolding(phone: string, id: string) {
  await col(phone).doc(id).delete();
}
