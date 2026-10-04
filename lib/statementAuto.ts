import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { seal } from './secretBox';
import { recordTransaction } from './recordTransaction';
import { saveBalance } from './moneyAccounts';
import { cleanNarration, type StatementRow } from './statementParse';
import { guessCategory } from './smsParse';

/**
 * Bank and card statement PDFs from Gmail, read automatically. The user saves each bank's PDF password in
 * Settings → Gmail; it's sealed with GMAIL_TOKEN_KEY in gmail_links/<phone>.statementPasswords.<bank>
 * (server-only, never sent back). Statement files are read in memory and never stored: only the
 * transactions (deduplicated against SMS/alerts and manual imports) and the closing balance are kept.
 */

export type StatementPassword = { sealed: string; v: number };
export type StatementState = {
  state: 'ok' | 'needs_password' | 'wrong_password' | 'unreadable'; at: number; locked?: boolean; added?: number; rows?: number; from?: string; to?: string;
  /** Compared with what alerts recorded for the same account/card: those the statement doesn't have. */
  checked?: boolean; extras?: { title: string; amount: number; date: string }[];
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Banks often lock account statements and credit card statements with different passwords, so each has its
 * own slot: `<bank>` for account statements, `<bank>__card` for card statements. Card-only issuers have one.
 */
export type StatementKind = 'account' | 'card';
export const CARD_ONLY = new Set(['slice', 'sbicard', 'amex', 'onecard']);
export const statementSlot = (bankId: string, kind: StatementKind) => (kind === 'card' ? `${bankId}__card` : bankId);
export const kindsFor = (bankId: string): StatementKind[] => (CARD_ONLY.has(bankId) ? ['card'] : ['account', 'card']);

/** Saves (or with null, removes) the PDF password for one kind of statement from a bank. */
export async function setStatementPassword(phone: string, bankId: string, password: string | null, kind: StatementKind = 'account') {
  const ref = db.collection('gmail_links').doc(phone);
  const field = `statementPasswords.${statementSlot(bankId, kind)}`;
  if (!password) {
    await ref.update({ [field]: FieldValue.delete() });
    return;
  }
  await ref.update({ [field]: { sealed: seal(password), v: Date.now() } satisfies StatementPassword });
}

/** Same row keys as the app's statement import (align-native/src/lib/statement-match.ts idSeeds). */
function rowIds(phone: string, rows: StatementRow[]) {
  const seen = new Map<string, number>();
  const refs = new Set<string>();
  return rows.map((r) => {
    if (r.ref && !refs.has(r.ref)) {
      refs.add(r.ref);
      return `auto_${sha(`${phone}_ref_${r.ref}`).slice(0, 28)}`;
    }
    const k = `${r.date}|${r.type}|${r.amount.toFixed(2)}|${r.description.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return `stmt_${sha(`${phone}_stmt_${k}#${n}`).slice(0, 28)}`;
  });
}

/**
 * Records a statement's transactions (skipping ones already in Align from any source) and its closing
 * balance. On a credit card statement the "payment received" credits are bill payments, not income.
 */
export async function importStatementRows(
  phone: string,
  rows: StatementRow[],
  opts: { bankId: string; bankName: string; at: number; creditCard: boolean; last4: string | null },
) {
  const keep = rows.filter((r) => !(opts.creditCard && r.type === 'income' && /payment|thank you|received|autopay|neft|imps|upi/i.test(r.description)));
  const ids = rowIds(phone, keep);
  let added = 0;
  for (let i = 0; i < keep.length; i++) {
    const r = keep[i];
    const merchant = cleanNarration(r.description) || r.description.slice(0, 40);
    const outcome = await recordTransaction(
      phone,
      { type: r.type, amount: r.amount, merchant, category: guessCategory(`${merchant} ${r.description}`, r.type), ref: r.ref, date: r.date, time: null },
      { source: 'statement', dedupText: `statement:${ids[i]}`, date: r.date, docId: ids[i], card: opts.creditCard && opts.last4 ? { last4: opts.last4 } : null, account: !opts.creditCard ? opts.last4 : null, text: r.description },
    );
    if (outcome === 'added') added++;
  }
  // Check: payments alerts recorded for this account/card in the statement's period that the statement
  // doesn't have (a duplicate, a mistake, or another account): listed for the user to look at
  const dates = keep.map((r) => r.date).sort();
  const extras: { title: string; amount: number; date: string }[] = [];
  if (opts.last4 && dates.length) {
    const field = opts.creditCard ? 'cardLast4' : 'accountLast4';
    const snap = await db.collection('planner_items').where('ownerId', '==', phone).where(field, '==', opts.last4).get();
    const unmatched = [...keep];
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
    for (const d of snap.docs) {
      const x = d.data();
      if (x.source === 'statement' || !x.date || x.date < dates[0] || x.date > dates[dates.length - 1]) continue;
      if (x.type !== 'expense' && x.type !== 'income' && x.type !== 'transfer') continue;
      const i = unmatched.findIndex((r) => Math.abs(r.amount - Number(x.amount)) < 0.01 && Math.abs(day(r.date) - day(x.date)) <= 2);
      if (i >= 0) unmatched.splice(i, 1);
      else extras.push({ title: String(x.title || 'Payment'), amount: Number(x.amount) || 0, date: x.date });
    }
  }

  // The last row with a running balance is where the account stood at the end of the statement
  if (!opts.creditCard) {
    const withBalance = rows.filter((r) => r.balance !== null);
    const last = withBalance[withBalance.length - 1];
    if (last && last.balance !== null) {
      const at = Math.min(opts.at, Date.parse(`${last.date}T18:29:00Z`));
      await saveBalance(phone, { bankId: opts.bankId, bankName: opts.bankName, last4: opts.last4, balance: last.balance, at });
    }
  }
  return { added, rows: keep.length, from: dates[0], to: dates[dates.length - 1], extras: extras.slice(0, 10), checked: !!opts.last4 };
}
