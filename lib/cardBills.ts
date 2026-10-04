import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { bankFromSender } from './bankSenders';
import type { CardBill } from './emailAlert';
import { istParts } from './recordTransaction';

/**
 * Credit card bills found in Gmail. Bills are kept server-only in gmail_links/<phone>/bills; reminders are
 * opt-in (gmail_links.billReminders): once the user says yes, each bill becomes an Agenda task
 * "Pay <card> · ₹<total>" due on its due date (kind 'card_bill'), which the app notifies 3 days before and
 * on the day, and the nightly WhatsApp summary mentions from 3 days out. A card payment confirmation from
 * the same issuer ticks the task off.
 */

export type StoredBill = CardBill & { id: string; issuer: string; issuerName: string; statementDate?: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const billsOf = (phone: string) => db.collection('gmail_links').doc(phone).collection('bills');

/** The listed bank a sender address belongs to. */
export function bankForSender(from: string) {
  return bankFromSender(from);
}

/** `at`: when the statement email arrived (its date is the statement date). */
export async function saveBill(phone: string, bill: CardBill, from: string, at?: number): Promise<StoredBill> {
  const bank = bankForSender(from);
  const issuer = bank?.id || from.split('@').pop() || 'card';
  const stored: StoredBill = {
    ...bill, issuer, issuerName: bank?.name || issuer, id: sha(`${phone}|${issuer}|${bill.last4 || ''}|${bill.dueDate}`),
    ...(at ? { statementDate: istParts(at).date } : {}),
  };
  await billsOf(phone).doc(stored.id).set({ ...stored, foundAt: FieldValue.serverTimestamp() }, { merge: true });
  return stored;
}

const inr = (n: number) => {
  const d = Number.isInteger(n) ? 0 : 2;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/** The Agenda task for a bill (created once; the user's edits are kept). */
export async function ensureBillTask(phone: string, bill: StoredBill) {
  const ref = db.collection('planner_items').doc(`bill_${bill.id}`);
  await db.runTransaction(async (t) => {
    if ((await t.get(ref)).exists) return;
    t.set(ref, {
      ownerId: phone,
      type: 'task',
      kind: 'card_bill',
      title: `Pay ${bill.issuerName} card${bill.last4 ? ` ••${bill.last4}` : ''} · ${inr(bill.totalDue)}`,
      dueDate: bill.dueDate,
      reminderTime: '10:00',
      done: false,
      priority: 'high',
      subtasks: [],
      bill: { issuer: bill.issuer, issuerName: bill.issuerName, last4: bill.last4, totalDue: bill.totalDue, minDue: bill.minDue },
      source: 'gmail',
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

const today = () => istParts(Date.now()).date;

/** Bills due from yesterday on, soonest first. */
export async function upcomingBills(phone: string): Promise<StoredBill[]> {
  const snap = await billsOf(phone).get();
  const from = istParts(Date.now() - 86400000).date;
  return snap.docs.map((d) => d.data() as StoredBill).filter((b) => b.dueDate >= from).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Yes/no to bill reminders. Yes creates tasks for bills that aren't past due. */
export async function setBillReminders(phone: string, on: boolean) {
  await db.collection('gmail_links').doc(phone).update({ billReminders: on });
  if (!on) return { created: 0 };
  const bills = (await upcomingBills(phone)).filter((b) => b.dueDate >= today());
  for (const b of bills) await ensureBillTask(phone, b);
  return { created: bills.length };
}

/** A card payment from this issuer was confirmed: tick off its open bill tasks due around now. */
export async function markBillsPaid(phone: string, issuer: string) {
  const snap = await db.collection('planner_items').where('ownerId', '==', phone).where('kind', '==', 'card_bill').where('done', '==', false).get();
  const lo = istParts(Date.now() - 20 * 86400000).date;
  const hi = istParts(Date.now() + 40 * 86400000).date;
  const open = snap.docs.filter((d) => d.data().bill?.issuer === issuer && d.data().dueDate >= lo && d.data().dueDate <= hi);
  for (const d of open) await d.ref.update({ done: true, paidAt: FieldValue.serverTimestamp() });
  return open.length;
}

/** Lines for the nightly WhatsApp summary: open bills due within three days, or overdue up to a week. */
export function billReminderLines(items: { kind?: string; done?: boolean; dueDate?: string; title?: string }[], todayKey: string) {
  const day = (k: string) => Date.parse(`${k}T00:00:00Z`) / 86400000;
  return items
    .filter((i) => i.kind === 'card_bill' && !i.done && i.dueDate)
    .map((i) => ({ i, left: day(i.dueDate!) - day(todayKey) }))
    .filter(({ left }) => left <= 3 && left >= -7)
    .sort((a, b) => a.left - b.left)
    .map(({ i, left }) => `  • ${i.title} — ${left < 0 ? `*overdue by ${-left} day${left === -1 ? '' : 's'}*` : left === 0 ? '*due today*' : `due in ${left} day${left === 1 ? '' : 's'}`}`);
}
