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
export type StatementState = { state: 'ok' | 'needs_password' | 'wrong_password' | 'unreadable'; at: number; added?: number; rows?: number; from?: string; to?: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Saves (or with null, removes) a bank's statement password. */
export async function setStatementPassword(phone: string, bankId: string, password: string | null) {
  const ref = db.collection('gmail_links').doc(phone);
  const field = `statementPasswords.${bankId}`;
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
      { source: 'statement', dedupText: `statement:${ids[i]}`, date: r.date, docId: ids[i], card: opts.creditCard && opts.last4 ? { last4: opts.last4 } : null },
    );
    if (outcome === 'added') added++;
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
  const dates = keep.map((r) => r.date).sort();
  return { added, rows: keep.length, from: dates[0], to: dates[dates.length - 1] };
}
