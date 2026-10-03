import { db } from './firebase';
import { merchantKey } from './merchantKey';

/**
 * Categories the user taught Align for merchants ("Isthara Parks → Food & Dining"): stored in the app's
 * category settings (planner_settings/preferences_<phone> → expenseCategories.merchants) when they change a
 * transaction's category by hand. Applied to every transaction added automatically afterwards.
 */
export async function merchantRules(phone: string): Promise<Record<string, string>> {
  const snap = await db.collection('planner_settings').doc(`preferences_${phone}`).get();
  const merchants = snap.data()?.expenseCategories?.merchants;
  return merchants && typeof merchants === 'object' ? (merchants as Record<string, string>) : {};
}

/** The user's category for this merchant, if they set one. */
export function ruleFor(rules: Record<string, string>, merchant: string | null | undefined): string | null {
  const key = merchantKey(merchant);
  return (key && typeof rules[key] === 'string' && rules[key]) || null;
}
