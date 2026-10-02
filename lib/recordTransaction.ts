import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import type { ParsedTransaction } from './smsParse';

export type Channel = 'sms' | 'email' | 'gmail';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const EMAIL_CHANNELS: Channel[] = ['email', 'gmail'];

/**
 * Saves an automatically detected transaction once. The same payment can arrive as an SMS, an alert email
 * (Gmail script or connected Gmail) and again on a retry, so:
 * - with a bank ref, every channel uses the same document (`auto_<sha256(phone_ref_<ref>)>`, also what
 *   statement import uses), created only if missing so user edits are never overwritten;
 * - without one, `dedupText` keys the document (the message text, or the Gmail message id), and a same-day,
 *   same-amount item already recorded from the other kind of channel (SMS vs email) counts as this one.
 */
export async function recordTransaction(
  phone: string,
  tx: ParsedTransaction,
  opts: { source: Channel; dedupText: string; date: string },
): Promise<'added' | 'duplicate'> {
  const dedupKey = tx.ref ? `ref_${tx.ref}` : `txt_${sha256(opts.dedupText.replace(/\s+/g, ' ').toLowerCase()).slice(0, 24)}`;
  const ref = db.collection('planner_items').doc(`auto_${sha256(`${phone}_${dedupKey}`).slice(0, 28)}`);

  if (!tx.ref) {
    const others: Channel[] = opts.source === 'sms' ? EMAIL_CHANNELS : ['sms'];
    const same = await db.collection('planner_items').where('ownerId', '==', phone).where('date', '==', opts.date).where('amount', '==', tx.amount).limit(10).get();
    if (same.docs.some((d) => others.includes(d.data()?.source) && d.data()?.type === tx.type)) return 'duplicate';
  }

  const created = await db.runTransaction(async (t) => {
    if ((await t.get(ref)).exists) return false;
    t.set(ref, {
      ownerId: phone,
      type: tx.type,
      title: tx.merchant,
      amount: tx.amount,
      date: opts.date,
      dueDate: opts.date,
      category: tx.category,
      tags: [tx.category],
      splits: [],
      source: opts.source,
      autoDetected: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return created ? 'added' : 'duplicate';
}
