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
  forDue?: string | null;
  totalDue?: number | null;
  minDue?: number | null;
  dueDate?: string | null;
  paid?: boolean | null;
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
  const [billSnap, paySnap, editSnap] = await Promise.all([
    db.collection('gmail_links').doc(phone).collection('bills').get(),
    root(phone).collection('card_payments').get(),
    root(phone).collection('card_edits').get(),
  ]);
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
    });
  }
  // Unpaid soonest first, then paid; hidden last
  return out.sort((a, b) => Number(a.hidden) - Number(b.hidden) || Number(a.status === 'paid') - Number(b.status === 'paid') || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
}

export async function accountBalances(phone: string): Promise<AccountBalance[]> {
  const snap = await root(phone).collection('accounts').get();
  return snap.docs.map((d) => d.data() as AccountBalance).sort((a, b) => b.at - a.at);
}
