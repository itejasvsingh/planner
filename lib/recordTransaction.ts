import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import type { ParsedTransaction } from './smsParse';
import { allMerchantRules, ruleFor, SELF_TRANSFER } from './merchantRules';

export type Channel = 'sms' | 'email' | 'gmail' | 'statement';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Sources that add transactions automatically; one payment often reaches several of them.
const AUTOMATIC = ['sms', 'email', 'gmail', 'statement'];

/** Date (YYYY-MM-DD) and time (HH:MM) in India for a moment. */
export function istParts(ms: number) {
  const iso = new Date(ms + 5.5 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

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
// A transfer is money moving out too: an expense later marked as a transfer is still the same payment
const sameDirection = (a: string, b: string) => a === b || ((a === 'transfer' || b === 'transfer') && a !== 'income' && b !== 'income');

/** A transaction as saved: your rules can turn an expense into a transfer. */
type Recorded = Omit<ParsedTransaction, 'type'> & { type: ParsedTransaction['type'] | 'transfer' };

async function recordedElsewhere(phone: string, tx: Recorded, date: string, source: Channel) {
  for (const d of [date, shiftDate(date, -1), shiftDate(date, 1)]) {
    const onDay = db.collection('planner_items').where('ownerId', '==', phone).where('date', '==', d);
    // A payment split with friends keeps only your share as its amount; the bank amount is the split's total.
    const [same, split] = await Promise.all([
      onDay.where('amount', '==', tx.amount).limit(10).get(),
      onDay.where('split.total', '==', tx.amount).limit(10).get(),
    ]);
    for (const doc of [...same.docs, ...split.docs]) {
      const x = doc.data();
      // Deleted in the app: kept as a marker so the same payment isn't added again from any source
      const xType = x.type === 'deleted' ? String(x.deletedType) : String(x.type);
      if (!sameDirection(xType, tx.type) || !AUTOMATIC.includes(x.source) || x.source === source) continue;
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
 * Deleting an automatic transaction in the app keeps its document as `type: 'deleted'` (see deleteItem in
 * align-native/src/lib/use-planner-items.ts), so it blocks both checks and the payment stays deleted.
 */
export async function recordTransaction(
  phone: string,
  parsed: ParsedTransaction,
  /** `time`: when the message arrived (HH:MM, India), used if the text has no time. */
  /** `card`: the credit card it was spent on, so the card's outstanding can include it. */
  /** `text`: the message (not stored), to recognise transfers between your own accounts. */
  /** `rules`: your payee rules, when the caller already has them (many rows at once). */
  opts: { source: Channel; dedupText: string; date: string; time?: string | null; card?: { last4: string } | null; account?: string | null; docId?: string; text?: string; rules?: { merchants: Record<string, string>; transfers: Record<string, string> } },
): Promise<'added' | 'duplicate'> {
  let tx: Recorded = parsed;
  const dedupKey = tx.ref ? `ref_${tx.ref}` : `txt_${sha256(opts.dedupText.replace(/\s+/g, ' ').toLowerCase()).slice(0, 24)}`;
  // `docId`: statement rows use the ids manual statement import gives them, so the two never double up
  const ref = db.collection('planner_items').doc(opts.docId || `auto_${sha256(`${phone}_${dedupKey}`).slice(0, 28)}`);

  // Your rules first: money to family or your own accounts is a transfer, and your category beats the guess
  const rules = opts.rules || (await allMerchantRules(phone));
  const transferTo = tx.type === 'expense' ? ruleFor(rules.transfers, tx.merchant) : null;
  if (transferTo || (tx.type !== 'income' && SELF_TRANSFER.test(`${tx.merchant} ${opts.text || ''}`))) {
    tx = { ...tx, type: 'transfer', category: transferTo || 'Self Transfer' };
  }
  if (await recordedElsewhere(phone, tx, opts.date, opts.source)) return 'duplicate';
  const category = tx.type === 'transfer' ? tx.category : ruleFor(rules.merchants, tx.merchant) || tx.category;

  const created = await db.runTransaction(async (t) => {
    if ((await t.get(ref)).exists) return false;
    t.set(ref, {
      ownerId: phone,
      type: tx.type,
      title: tx.merchant,
      amount: tx.amount,
      date: opts.date,
      dueDate: opts.date,
      time: tx.time || opts.time || null,
      category,
      tags: [category],
      splits: [],
      source: opts.source,
      ref: tx.ref || null,
      ...(opts.card ? { cardLast4: opts.card.last4 } : opts.account ? { accountLast4: opts.account } : {}),
      autoDetected: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return created ? 'added' : 'duplicate';
}
