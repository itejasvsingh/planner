import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { db } from './firebase';
import { getPhoneVariants } from './phone';

/**
 * Joining the two ways of signing in. Everything in Align is filed under a phone number; an email account has a
 * stand-in number (`910` + nine digits, see lib/emailAuth.ts). When that account gains a real WhatsApp number, or a
 * real-number account gains the email of an email account, the stand-in's data moves to the real number, so one
 * person has one account whichever way they sign in. Only a stand-in is ever merged away: two real numbers never are.
 * Where both sides already have something, the real number's version wins and the stand-in's is used only to fill gaps.
 */
export const isStandIn = (phone: string | null | undefined) => /^910\d{9}$/.test(String(phone || ''));

/** Copies a document and all its sub-collections to `to`, leaving anything already there untouched. */
async function copyTree(from: DocumentReference, to: DocumentReference) {
  const [src, dst] = await Promise.all([from.get(), to.get()]);
  if (src.exists && !dst.exists) await to.set(src.data()!);
  for (const col of await from.listCollections()) {
    const docs = await col.get();
    for (const d of docs.docs) await copyTree(d.ref, to.collection(col.id).doc(d.id));
  }
}

async function deleteTree(ref: DocumentReference) {
  for (const col of await ref.listCollections()) {
    const docs = await col.get();
    for (const d of docs.docs) await deleteTree(d.ref);
  }
  await ref.delete();
}

/** Moves everything filed under the stand-in number `from` to the real number `to`. Safe to run again. */
export async function mergeAccounts(from: string, to: string, firestore: Firestore = db): Promise<{ items: number }> {
  if (!isStandIn(from) || from === to || isStandIn(to)) throw new Error('Only a stand-in account can be merged into a real number.');

  // The tasks, expenses and everything else in the planner: re-owned in batches
  const owners = [...new Set([from, ...getPhoneVariants(from)])];
  let items = 0;
  const snap = await firestore.collection('planner_items').where('ownerId', 'in', owners).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = firestore.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { ownerId: to });
    await batch.commit();
    items += Math.min(400, snap.docs.length - i);
  }

  // Settings: the real number's win, the stand-in's only fill what's missing
  for (const prefix of ['preferences_', 'budgets_']) {
    const a = firestore.collection('planner_settings').doc(`${prefix}${from}`);
    const b = firestore.collection('planner_settings').doc(`${prefix}${to}`);
    const [sa, sb] = await Promise.all([a.get(), b.get()]);
    if (sa.exists) await b.set({ ...sa.data(), ...(sb.data() || {}) });
    if (sa.exists) await a.delete();
  }
  const sessA = firestore.collection('user_sessions').doc(from);
  const sessSnap = await sessA.get();
  if (sessSnap.exists) {
    await firestore.collection('user_sessions').doc(to).set({ ...sessSnap.data(), ...((await firestore.collection('user_sessions').doc(to).get()).data() || {}) });
    await sessA.delete();
  }
  // SMS/email import keys now belong to the real number
  const keys = await firestore.collection('planner_settings').where('phone', '==', from).get();
  for (const k of keys.docs) await k.ref.update({ phone: to });

  // Server-only stores (balances, cards, statements, Gmail link, push devices)
  for (const col of ['money_accounts', 'gmail_links', 'push_subscriptions']) {
    const src = firestore.collection(col).doc(from);
    await copyTree(src, firestore.collection(col).doc(to));
    await deleteTree(src);
  }

  // Any email that pointed at the stand-in now points at the real number
  const ids = await firestore.collection('email_identities').where('phone', '==', from).get();
  for (const d of ids.docs) await d.ref.update({ phone: to });
  return { items };
}
