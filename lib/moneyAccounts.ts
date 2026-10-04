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

export type AccountBalance = { id: string; bankId: string; bankName: string; last4: string | null; balance: number; at: number };

/** Keeps the newest balance seen for an account (older messages read later don't overwrite it). */
export async function saveBalance(phone: string, a: Omit<AccountBalance, 'id'>) {
  const id = `${a.bankId}_${a.last4 || 'account'}`;
  const ref = root(phone).collection('accounts').doc(id);
  await db.runTransaction(async (t) => {
    const prev = (await t.get(ref)).data() as AccountBalance | undefined;
    if (prev && prev.at > a.at) return;
    t.set(ref, { ...a, id });
  });
}

export async function recordCardPayment(phone: string, issuer: string, amount: number, at: number) {
  const date = istParts(at).date;
  await root(phone).collection('card_payments').doc(sha(`${issuer}|${amount}|${date}`)).set({ issuer, amount, at, date });
}

export type CardSummary = {
  issuer: string;
  issuerName: string;
  last4: string | null;
  statementDate: string | null;
  dueDate: string;
  totalDue: number;
  minDue: number | null;
  paidSince: number;
  spentSince: number;
  /** What you owe on the card now: statement still unpaid + new spends. */
  outstanding: number;
  status: 'paid' | 'due' | 'overdue';
  daysLeft: number;
};

const dayNum = (key: string) => Date.parse(`${key}T00:00:00Z`) / DAY;

/** The latest statement per card, with payments and spends since it. */
export async function cardSummaries(phone: string, now = Date.now()): Promise<CardSummary[]> {
  const [billSnap, paySnap] = await Promise.all([
    db.collection('gmail_links').doc(phone).collection('bills').get(),
    root(phone).collection('card_payments').get(),
  ]);
  const latest = new Map<string, StoredBill & { statementDate?: string }>();
  for (const d of billSnap.docs) {
    const b = d.data() as StoredBill & { statementDate?: string };
    const key = `${b.issuer}_${b.last4 || ''}`;
    const prev = latest.get(key);
    if (!prev || b.dueDate > prev.dueDate) latest.set(key, b);
  }
  const payments = paySnap.docs.map((d) => d.data() as { issuer: string; amount: number; date: string });
  const today = istParts(now).date;

  const out: CardSummary[] = [];
  for (const b of latest.values()) {
    // Statements usually come ~20 days before the due date when the email date isn't known
    const since = b.statementDate || istParts(Date.parse(`${b.dueDate}T00:00:00Z`) - 20 * DAY).date;
    const paidSince = payments.filter((p) => p.issuer === b.issuer && p.date >= since).reduce((s, p) => s + p.amount, 0);
    let spentSince = 0;
    if (b.last4) {
      const snap = await db.collection('planner_items').where('ownerId', '==', phone).where('cardLast4', '==', b.last4).get();
      for (const d of snap.docs) {
        const x = d.data();
        if ((x.date || '') < since) continue;
        if (x.type === 'expense') spentSince += Number(x.amount) || 0;
        else if (x.type === 'income') spentSince -= Number(x.amount) || 0; // refunds to the card
      }
    }
    // A ticked-off reminder counts as paid too
    const task = await db.collection('planner_items').doc(`bill_${b.id}`).get();
    const paid = paidSince >= b.totalDue - 1 || task.data()?.done === true;
    const unpaid = paid ? 0 : Math.max(0, b.totalDue - paidSince);
    const daysLeft = dayNum(b.dueDate) - dayNum(today);
    out.push({
      issuer: b.issuer,
      issuerName: b.issuerName,
      last4: b.last4,
      statementDate: b.statementDate || null,
      dueDate: b.dueDate,
      totalDue: b.totalDue,
      minDue: b.minDue,
      paidSince: Math.round(paidSince * 100) / 100,
      spentSince: Math.round(Math.max(0, spentSince) * 100) / 100,
      outstanding: Math.round((unpaid + Math.max(0, spentSince)) * 100) / 100,
      status: paid ? 'paid' : daysLeft < 0 ? 'overdue' : 'due',
      daysLeft,
    });
  }
  // Unpaid soonest first, then paid
  return out.sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid') || a.dueDate.localeCompare(b.dueDate));
}

export async function accountBalances(phone: string): Promise<AccountBalance[]> {
  const snap = await root(phone).collection('accounts').get();
  return snap.docs.map((d) => d.data() as AccountBalance).sort((a, b) => b.at - a.at);
}
