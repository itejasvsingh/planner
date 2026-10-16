import { createHash } from 'node:crypto';
import { db } from './firebase';
import { istParts } from './recordTransaction';
import type { StoredBill } from './cardBills';

/**
 * Cards and accounts for the Money screen. Server-only (no client rule matches money_accounts):
 * - money_accounts/<phone>/accounts/<bank>_<last4>: the latest available balance an alert quoted;
 * - money_accounts/<phone>/card_payments/<id>: card bill payments confirmed by the issuer.
 * A card's "outstanding now" is its latest statement's total, less payments since the statement, plus
 * credit card spends recorded since then on that card (transactions carry `cardLast4`).
 */

const DAY = 86400000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const root = (phone: string) => db.collection('money_accounts').doc(phone);

export type AccountBalance = {
  id: string; bankId: string; bankName: string; last4: string | null; balance: number; at: number;
  /** The user left this account out of the bank total. */
  excluded?: boolean;
  /** Typed in by the user (alerts only give the last digits); shown for copying. Never logged. */
  ifsc?: string | null; accountNumber?: string | null; holder?: string | null;
  /** One balance per day, oldest first (about the last 90 days). */
  history?: { d: string; b: number }[];
};
export type AccountEdit = { excluded?: boolean; ifsc?: string | null; accountNumber?: string | null; holder?: string | null };

/** Keeps the newest balance seen for an account (older messages read later don't overwrite it). */
export async function saveBalance(phone: string, a: Omit<AccountBalance, 'id'>) {
  const id = `${a.bankId}_${a.last4 || 'account'}`;
  const ref = root(phone).collection('accounts').doc(id);
  const date = istParts(a.at).date;
  const dayRef = ref.collection('history').doc(date);
  await db.runTransaction(async (t) => {
    const [prevSnap, daySnap] = await Promise.all([t.get(ref), t.get(dayRef)]);
    const prev = prevSnap.data() as AccountBalance | undefined;
    // The day keeps its latest balance, even when a message for an older day arrives late
    if (!daySnap.exists || (daySnap.data()?.at ?? 0) <= a.at) t.set(dayRef, { date, balance: a.balance, at: a.at });
    if (prev && prev.at > a.at) return;
    t.set(ref, { ...a, id });
  });
}

export async function saveAccountEdit(phone: string, id: string, edit: AccountEdit) {
  await root(phone).collection('account_edits').doc(id).set(edit, { merge: true });
}

export async function recordCardPayment(phone: string, issuer: string, amount: number, at: number) {
  const date = istParts(at).date;
  await root(phone).collection('card_payments').doc(sha(`${issuer}|${amount}|${date}`)).set({ issuer, amount, at, date });
}

export type CardSummary = {
  /** Stable id: `<issuer>_<last4>` for cards found in statements, `manual_<id>` for cards added by hand. */
  key: string;
  issuer: string;
  issuerName: string;
  last4: string | null;
  statementDate: string | null;
  dueDate: string | null;
  totalDue: number;
  minDue: number | null;
  paidSince: number;
  spentSince: number;
  /** What you owe on the card now: statement still unpaid + new spends. */
  outstanding: number;
  status: 'paid' | 'due' | 'overdue';
  daysLeft: number | null;
  manual: boolean;
  hidden: boolean;
  /** The user changed this statement's amounts or due date. */
  edited: boolean;
  /** Due-date reminders on for this card (its own switch, else the "remind me about card bills" answer). */
  remind: boolean;
  /** Credit limit, typed in by the user (statements don't give it); null when unknown. */
  limit: number | null;
};

/**
 * The user's changes to a card (money_accounts/<phone>/card_edits/<key>). Name, last digits and hidden stay;
 * amounts, due date and "paid" belong to one statement (`forDue`) and stop applying when a newer one arrives.
 * Cards added by hand (`manual`) are only these fields.
 */
export type CardEdit = {
  name?: string | null;
  last4?: string | null;
  hidden?: boolean;
  manual?: boolean;
  /** Reminders for this card: true/false, or unset to follow the general answer. */
  remind?: boolean | null;
  forDue?: string | null;
  totalDue?: number | null;
  minDue?: number | null;
  dueDate?: string | null;
  paid?: boolean | null;
  /** The card's credit limit; stays across statements. */
  limit?: number | null;
};

const dayNum = (key: string) => Date.parse(`${key}T00:00:00Z`) / DAY;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function saveCardEdit(phone: string, key: string, edit: CardEdit) {
  await root(phone).collection('card_edits').doc(key).set(edit, { merge: true });
}

export async function deleteManualCard(phone: string, key: string) {
  if (key.startsWith('manual_')) await root(phone).collection('card_edits').doc(key).delete();
}

/** The latest statement per card (or the details entered by hand), with payments and spends since it. */
export async function cardSummaries(phone: string, now = Date.now()): Promise<CardSummary[]> {
  const [billSnap, paySnap, editSnap, linkSnap] = await Promise.all([
    db.collection('gmail_links').doc(phone).collection('bills').get(),
    root(phone).collection('card_payments').get(),
    root(phone).collection('card_edits').get(),
    db.collection('gmail_links').doc(phone).get(),
  ]);
  const remindAll = linkSnap.data()?.billReminders === true;
  const edits = new Map(editSnap.docs.map((d) => [d.id, d.data() as CardEdit]));
  type Base = { key: string; issuer: string; issuerName: string; last4: string | null; statementDate?: string; dueDate: string | null; totalDue: number; minDue: number | null; billId?: string; manual: boolean };
  const cards = new Map<string, Base>();
  for (const d of billSnap.docs) {
    const b = d.data() as StoredBill & { statementDate?: string };
    const key = `${b.issuer}_${b.last4 || ''}`;
    const prev = cards.get(key);
    if (!prev || (prev.dueDate || '') < b.dueDate) {
      cards.set(key, { key, issuer: b.issuer, issuerName: b.issuerName, last4: b.last4, statementDate: b.statementDate, dueDate: b.dueDate, totalDue: b.totalDue, minDue: b.minDue, billId: b.id, manual: false });
    }
  }
  for (const [key, e] of edits) {
    if (e.manual) cards.set(key, { key, issuer: 'manual', issuerName: e.name || 'Card', last4: e.last4 || null, dueDate: e.dueDate || null, totalDue: e.totalDue || 0, minDue: e.minDue ?? null, manual: true });
  }
  const payments = paySnap.docs.map((d) => d.data() as { issuer: string; amount: number; date: string });
  const today = istParts(now).date;

  const out: CardSummary[] = [];
  for (const c of cards.values()) {
    const e = edits.get(c.key) || {};
    // Statement-specific changes only while that statement is the latest one
    const current = c.manual || (e.forDue != null && e.forDue === c.dueDate);
    const dueDate = (current && e.dueDate) || c.dueDate;
    const totalDue = current && e.totalDue != null ? e.totalDue : c.totalDue;
    const minDue = current && e.minDue !== undefined ? e.minDue ?? null : c.minDue;
    const last4 = e.last4 || c.last4;
    // Statements usually come ~20 days before the due date when the email date isn't known
    const since = c.statementDate || (dueDate ? istParts(Date.parse(`${dueDate}T00:00:00Z`) - 20 * DAY).date : istParts(now - 30 * DAY).date);
    const paidSince = c.manual ? 0 : payments.filter((p) => p.issuer === c.issuer && p.date >= since).reduce((s, p) => s + p.amount, 0);
    let spentSince = 0;
    if (last4) {
      const snap = await db.collection('planner_items').where('ownerId', '==', phone).where('cardLast4', '==', last4).get();
      for (const d of snap.docs) {
        const x = d.data();
        if ((x.date || '') < since) continue;
        if (x.type === 'expense') spentSince += Number(x.amount) || 0;
        else if (x.type === 'income') spentSince -= Number(x.amount) || 0; // refunds to the card
      }
    }
    // Paid: the user said so for this statement, payments cover it, or the bill reminder was ticked off
    let paid = current && e.paid != null ? e.paid : paidSince >= totalDue - 1;
    if (!(current && e.paid != null) && !paid && c.billId) paid = (await db.collection('planner_items').doc(`bill_${c.billId}`).get()).data()?.done === true;
    const unpaid = paid ? 0 : Math.max(0, totalDue - paidSince);
    const daysLeft = dueDate ? dayNum(dueDate) - dayNum(today) : null;
    out.push({
      key: c.key,
      issuer: c.issuer,
      issuerName: e.name || c.issuerName,
      last4,
      statementDate: c.statementDate || null,
      dueDate,
      totalDue,
      minDue,
      paidSince: r2(paidSince),
      spentSince: r2(Math.max(0, spentSince)),
      outstanding: r2(unpaid + Math.max(0, spentSince)),
      status: paid || totalDue <= 0 ? 'paid' : daysLeft !== null && daysLeft < 0 ? 'overdue' : 'due',
      daysLeft,
      manual: c.manual,
      hidden: e.hidden === true,
      edited: !c.manual && current && (e.totalDue != null || e.minDue !== undefined || !!e.dueDate || e.paid != null),
      remind: typeof e.remind === 'boolean' ? e.remind : remindAll,
      limit: e.limit ?? null,
    });
  }
  // Unpaid soonest first, then paid; hidden last
  return out.sort((a, b) => Number(a.hidden) - Number(b.hidden) || Number(a.status === 'paid') - Number(b.status === 'paid') || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
}

const inrText = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * WhatsApp lines for cards with reminders on that are due within three days (or overdue up to a week),
 * with what you owe now: "  • HDFC Bank ••4321: ₹8,500 to pay (min ₹600), due in 3 days".
 */
export function cardReminderLines(cards: CardSummary[]): string[] {
  return cards
    .filter((c) => c.remind && !c.hidden && c.status !== 'paid' && c.outstanding > 0 && c.daysLeft !== null && c.daysLeft <= 3 && c.daysLeft >= -7)
    .sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0))
    .map((c) => {
      const left = c.daysLeft as number;
      const when = left < 0 ? `*overdue by ${-left} day${left === -1 ? '' : 's'}*` : left === 0 ? '*due today*' : `due in ${left} day${left === 1 ? '' : 's'}`;
      const min = c.minDue && c.minDue < c.outstanding ? ` (min ${inrText(c.minDue)})` : '';
      return `  • ${c.issuerName}${c.last4 ? ` ••${c.last4}` : ''}: ${inrText(c.outstanding)} to pay${min}, ${when}`;
    });
}

/**
 * Things Align can't read from alerts that you still want in your net worth (a flat's value, a loan from a friend):
 * money_accounts/<phone>/net_worth/<id>. Server-only like the rest.
 */
export type NetEntry = { id: string; name: string; kind: 'asset' | 'liability'; value: number; at: number };
export const MAX_NET_ENTRIES = 50;

export async function netEntries(phone: string): Promise<NetEntry[]> {
  const snap = await root(phone).collection('net_worth').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NetEntry, 'id'>) })).sort((a, b) => a.at - b.at);
}

/** Adds (no id) or changes an entry; returns its id, or null when the list is full / the entry doesn't exist. */
export async function saveNetEntry(phone: string, entry: { id?: string; name?: string; kind?: 'asset' | 'liability'; value?: number }, now = Date.now()): Promise<string | null> {
  const col = root(phone).collection('net_worth');
  if (entry.id) {
    const { id, ...rest } = entry;
    const ref = col.doc(id);
    if (!(await ref.get()).exists) return null; // never creates a half-filled entry
    await ref.set(rest, { merge: true });
    return id;
  }
  if ((await col.count().get()).data().count >= MAX_NET_ENTRIES) return null;
  const ref = col.doc();
  await ref.set({ name: entry.name, kind: entry.kind, value: entry.value, at: now });
  return ref.id;
}

export async function deleteNetEntry(phone: string, id: string) {
  await root(phone).collection('net_worth').doc(id).delete();
}

export async function accountBalances(phone: string, now = Date.now()): Promise<AccountBalance[]> {
  const [snap, editSnap] = await Promise.all([root(phone).collection('accounts').get(), root(phone).collection('account_edits').get()]);
  const edits = new Map(editSnap.docs.map((d) => [d.id, d.data() as AccountEdit]));
  const from = istParts(now - 90 * DAY).date;
  const out = await Promise.all(snap.docs.map(async (d) => {
    const a = d.data() as AccountBalance;
    const e = edits.get(d.id) || {};
    const hist = await d.ref.collection('history').where('date', '>=', from).get();
    const history = hist.docs.map((h) => h.data() as { date: string; balance: number }).sort((x, y) => x.date.localeCompare(y.date)).map((h) => ({ d: h.date, b: h.balance }));
    return { ...a, excluded: e.excluded === true, ifsc: e.ifsc || null, accountNumber: e.accountNumber || null, holder: e.holder || null, history };
  }));
  return out.sort((a, b) => b.at - a.at);
}
