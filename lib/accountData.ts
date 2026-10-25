import type { DocumentReference } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { adminAuth, db } from './firebase';
import { getPhoneVariants } from './phone';
import { deleteTree } from './accountLink';
import { disconnect } from './gmail';

/**
 * "Download my data" and "Delete my account". Everything Align keeps about a person is filed under their phone number
 * (see lib/accountLink.ts); this reads it all back, or removes it all, including the Firebase sign-in itself.
 * The export leaves out secrets: the Gmail access key, saved statement passwords, the SMS import key.
 */
const toPlain = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && typeof (val as { toDate?: unknown }).toDate === 'function' ? (val as { toDate: () => Date }).toDate().toISOString() : val)));

async function readTree(ref: DocumentReference, skip: string[] = []): Promise<unknown> {
  const snap = await ref.get();
  const out: Record<string, unknown> = {};
  for (const col of await ref.listCollections()) {
    if (skip.includes(col.id)) continue;
    const docs = await col.get();
    out[col.id] = await Promise.all(docs.docs.map(async (d) => ({ id: d.id, ...(d.data() as object), ...(await readTree(d.ref, skip) as object) })));
  }
  return snap.exists ? { ...snap.data(), ...out } : out;
}

const emailKey = (email: string) => createHash('sha256').update(`email:${email}`).digest('hex').slice(0, 32);

export async function exportAccount(phone: string) {
  const owners = [...new Set([phone, ...getPhoneVariants(phone)])];
  const [items, prefs, budgets, session, money, gmail, identities] = await Promise.all([
    db.collection('planner_items').where('ownerId', 'in', owners).get(),
    db.collection('planner_settings').doc(`preferences_${phone}`).get(),
    db.collection('planner_settings').doc(`budgets_${phone}`).get(),
    db.collection('user_sessions').doc(phone).get(),
    readTree(db.collection('money_accounts').doc(phone)),
    readTree(db.collection('gmail_links').doc(phone)),
    db.collection('email_identities').where('phone', '==', phone).get(),
  ]);
  const g = (gmail || {}) as Record<string, unknown>;
  // Secrets stay out: the stored Gmail key and the statement passwords
  for (const k of ['token', 'statementPasswords']) delete g[k];
  return toPlain({
    exportedAt: new Date().toISOString(),
    account: { phone, emails: identities.docs.map((d) => d.data().email) },
    items: items.docs.map((d) => ({ id: d.id, ...d.data() })),
    settings: { preferences: prefs.data() || null, budgets: budgets.data() || null, session: session.data() || null },
    money: money,
    gmail: g,
  });
}

/** Removes everything for this person, then their Firebase sign-ins. Returns counts only. */
export async function deleteAccount(phone: string, uid: string): Promise<{ items: number }> {
  // Stop reading their Gmail and revoke Align's access at Google first
  await disconnect(phone).catch(() => {});

  const owners = [...new Set([phone, ...getPhoneVariants(phone)])];
  const snap = await db.collection('planner_items').where('ownerId', 'in', owners).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }

  for (const id of [`preferences_${phone}`, `budgets_${phone}`]) await db.collection('planner_settings').doc(id).delete();
  const keys = await db.collection('planner_settings').where('phone', '==', phone).get();
  for (const k of keys.docs) await k.ref.delete();
  await db.collection('user_sessions').doc(phone).delete();
  for (const col of ['money_accounts', 'gmail_links', 'push_subscriptions']) await deleteTree(db.collection(col).doc(phone));
  await db.collection('auth_codes').doc(phone).delete().catch(() => {});

  // Email sign-ins that pointed at this number, and the stand-in number if this was an email-only account
  const ids = await db.collection('email_identities').where('phone', '==', phone).get();
  const authUids = new Set<string>([uid, `wa_${phone}`]);
  for (const d of ids.docs) {
    authUids.add(`em_${emailKey(String(d.data().email))}`);
    await db.collection('auth_codes').doc(`em_${emailKey(String(d.data().email))}`).delete().catch(() => {});
    await d.ref.delete();
  }
  if (/^910\d{9}$/.test(phone)) await db.collection('email_phones').doc(phone).delete().catch(() => {});

  for (const u of authUids) {
    await db.collection('users').doc(u).delete().catch(() => {});
    await adminAuth().deleteUser(u).catch(() => {});
  }
  return { items: snap.size };
}
