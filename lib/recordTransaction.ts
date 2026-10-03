import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import type { ParsedTransaction } from './smsParse';

export type Channel = 'sms' | 'email' | 'gmail';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Sources that add transactions automatically; one payment often reaches several of them.
const AUTOMATIC = ['sms', 'email', 'gmail', 'statement'];

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The same payment already recorded from another source: same amount and direction within a day either side
 * (an SMS and its email can fall on different dates around midnight), unless both carry bank references that
 * differ, which proves they are separate payments. Same-source items never count, so two genuine ₹20 payments
 * on one day from SMS are both kept.
 */
async function recordedElsewhere(phone: string, tx: ParsedTransaction, date: string, source: Channel) {
  for (const d of [date, shiftDate(date, -1), shiftDate(date, 1)]) {
    const same = await db.collection('planner_items').where('ownerId', '==', phone).where('date', '==', d).where('amount', '==', tx.amount).limit(10).get();
    for (const doc of same.docs) {
      const x = doc.data();
      if (x.type !== tx.type || !AUTOMATIC.includes(x.source) || x.source === source) continue;
      if (tx.ref && x.ref && String(x.ref) !== tx.ref) continue;
      return true;
    }
  }
  return false;
}

/**
 * Saves an automatically detected transaction once. The same payment can arrive as an SMS, an alert email
 * (Gmail script or connected Gmail), on a statement, and again on a retry, so:
 * - with a bank ref, every source uses the same document (`auto_<sha256(phone_ref_<ref>)>`, also what statement
 *   import uses), created only if missing so user edits are never overwritten;
 * - without one, `dedupText` keys the document (the message text, or the Gmail message id);
 * - either way, a matching payment already recorded from another source counts as this one.
 */
export async function recordTransaction(
  phone: string,
  tx: ParsedTransaction,
  opts: { source: Channel; dedupText: string; date: string },
): Promise<'added' | 'duplicate'> {
  const dedupKey = tx.ref ? `ref_${tx.ref}` : `txt_${sha256(opts.dedupText.replace(/\s+/g, ' ').toLowerCase()).slice(0, 24)}`;
  const ref = db.collection('planner_items').doc(`auto_${sha256(`${phone}_${dedupKey}`).slice(0, 28)}`);

  if (await recordedElsewhere(phone, tx, opts.date, opts.source)) return 'duplicate';

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
      ref: tx.ref || null,
      autoDetected: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return created ? 'added' : 'duplicate';
}
