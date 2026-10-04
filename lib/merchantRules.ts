import { db } from './firebase';
import { merchantKey } from './merchantKey';

/**
 * Categories the user taught Align for merchants ("Isthara Parks → Food & Dining"): stored in the app's
 * category settings (planner_settings/preferences_<phone> → expenseCategories.merchants) when they change a
 * transaction's category by hand. Applied to every transaction added automatically afterwards.
 */
export async function merchantRules(phone: string): Promise<Record<string, string>> {
  return (await allMerchantRules(phone)).merchants;
}

/**
 * Both kinds of rule: `merchants` (payee → category) and `transfers` (payee → transfer category, e.g. Mom →
 * Family, or your own other account → Self Transfer): money sent to those is a transfer, not spending.
 */
export async function allMerchantRules(phone: string): Promise<{ merchants: Record<string, string>; transfers: Record<string, string> }> {
  const snap = await db.collection('planner_settings').doc(`preferences_${phone}`).get();
  const cfg = snap.data()?.expenseCategories || {};
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});
  return { merchants: obj(cfg.merchants), transfers: obj(cfg.transferMerchants) };
}

/** Wording banks use for moving money between your own accounts. */
export const SELF_TRANSFER = /\bself[\s-]*(?:transfer|trf|a\/c|account)\b|\bto\s+self\b|\bown\s+(?:a\/c|account|acct)\b|\bsweep(?:\s*(?:in|out))?\b/i;

/** The user's category for this merchant, if they set one. */
export function ruleFor(rules: Record<string, string>, merchant: string | null | undefined): string | null {
  const key = merchantKey(merchant);
  return (key && typeof rules[key] === 'string' && rules[key]) || null;
}
