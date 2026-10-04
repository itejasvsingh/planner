import { createHash } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { seal } from './secretBox';
import { recordTransaction } from './recordTransaction';
import { allMerchantRules } from './merchantRules';
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
  state: 'ok' | 'needs_password' | 'wrong_password' | 'unreadable'; at: number; locked?: boolean; added?: number;
  /** Which email, and when Align found it (for "new statement" notifications). */
  msgId?: string; foundAt?: number; rows?: number; from?: string; to?: string;
  /** Compared with what alerts recorded for the same account/card: those the statement doesn't have. */
  checked?: boolean; extras?: { title: string; amount: number; date: string }[];
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Banks often lock account statements and credit card statements with different passwords, so each has its
 * own slot: `<bank>` for account statements, `<bank>__card` for card statements. Card-only issuers have one.
 */
export type StatementKind = 'account' | 'card';
// slice isn't here: it's a bank now (slice Small Finance Bank) and sends savings account statements too
export const CARD_ONLY = new Set(['sbicard', 'amex', 'onecard']);

/**
 * Whether a statement email is for a bank account or a credit card: the subject decides when it says so,
 * then the body (card words like "total amount due", account words like "savings account").
 */
export function statementKind(bankId: string, subject: string, text: string): StatementKind {
  if (CARD_ONLY.has(bankId)) return 'card';
  if (/credit\s*card|\bcard\s+(?:statement|bill)|\bcc\s+statement/i.test(subject)) return 'card';
  if (/\baccount\b|\bsavings\b|\ba\/c\b|\bpassbook\b/i.test(subject)) return 'account';
  const card = /credit\s*card|\bcard\s+(?:statement|bill|ending|no\.?)|total\s+amount\s+due|minimum\s+amount\s+due/i.test(text);
  const account = /\b(?:savings|current)\s+account|account\s+statement|statement\s+of\s+account|\ba\/c\s+(?:no|statement)/i.test(text);
  return card && !account ? 'card' : 'account';
}

/** Changes whenever either of a bank's statement passwords changes (a locked file is then tried again). */
export function passwordVersion(passwords: Record<string, StatementPassword>, bankId: string) {
  return (passwords[statementSlot(bankId, 'account')]?.v || 0) + (passwords[statementSlot(bankId, 'card')]?.v || 0);
}
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

const KIND = (slot: string) => (slot.endsWith('__card') ? 'card' : 'account');

/** One line about a statement Align found: what it read, or that it needs its password. */
export function statementLine(bankName: string, slot: string, s: StatementState): string {
  const what = `${bankName} ${KIND(slot) === 'card' ? 'credit card' : 'account'} statement`;
  if (s.state === 'needs_password') return `${what} found: it needs its PDF password (Align → Settings → Gmail).`;
  if (s.state === 'wrong_password') return `${what} found, but the saved password didn't open it. Check it in Align → Settings → Gmail.`;
  if (s.state === 'unreadable') return `${what} found, but it couldn't be read.`;
  const match = !s.checked ? '' : s.extras?.length ? ` ${s.extras.length} payment${s.extras.length === 1 ? '' : 's'} from alerts ${s.extras.length === 1 ? "isn't" : "aren't"} on it: check Money → Cards.` : ' Everything matches.';
  return `${what} read: ${s.rows} transactions, ${s.added} new.${match}`;
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
  opts: { bankId: string; bankName: string; at: number; creditCard: boolean; last4: string | null; deadline?: number },
) {
  const rules = await allMerchantRules(phone);
  const keep = rows.filter((r) => !(opts.creditCard && r.type === 'income' && /payment|thank you|received|autopay|neft|imps|upi/i.test(r.description)));
  const ids = rowIds(phone, keep);
  let added = 0;
  let complete = true;
  for (let i = 0; i < keep.length; i++) {
    // Out of time: stop here; the next check continues (rows already saved are skipped, no duplicates)
    if (opts.deadline && Date.now() > opts.deadline) { complete = false; break; }
    const r = keep[i];
    const merchant = cleanNarration(r.description) || r.description.slice(0, 40);
    const outcome = await recordTransaction(
      phone,
      { type: r.type, amount: r.amount, merchant, category: guessCategory(`${merchant} ${r.description}`, r.type), ref: r.ref, date: r.date, time: null },
      { source: 'statement', dedupText: `statement:${ids[i]}`, date: r.date, docId: ids[i], card: opts.creditCard && opts.last4 ? { last4: opts.last4 } : null, account: !opts.creditCard ? opts.last4 : null, text: r.description, rules },
    );
    if (outcome === 'added') added++;
  }
  // Check: payments alerts recorded for this account/card in the statement's period that the statement
  // doesn't have (a duplicate, a mistake, or another account): listed for the user to look at
  const dates = keep.map((r) => r.date).sort();
  const extras: { title: string; amount: number; date: string }[] = [];
  if (!complete) return { added, rows: keep.length, from: dates[0], to: dates[dates.length - 1], extras, checked: false, complete };
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
  return { added, rows: keep.length, from: dates[0], to: dates[dates.length - 1], extras: extras.slice(0, 10), checked: !!opts.last4, complete };
}

export type StatementGroup = {
  bankId: string;
  bankName: string;
  kind: StatementKind;
  /** Statements found in the search window, and the newest one's date. */
  count: number;
  latest: number;
  /** true: needs a password; false: opens without one; null: not checked yet. */
  locked: boolean | null;
  hasPassword: boolean;
  /** The saved password didn't open the last one. */
  wrongPassword: boolean;
  /** The bank is ticked in Settings → Gmail (else its statements aren't read until it is). */
  selected: boolean;
};

/** Statements found (gmail_links.statementIndex), one row per bank and kind, for the two lists. */
export function statementGroups(link: Record<string, any>): { accounts: StatementGroup[]; cards: StatementGroup[] } {
  const index = (link.statementIndex || []) as { bankId: string; bankName: string; kind: StatementKind; date: number; locked: boolean | null }[];
  const passwords = (link.statementPasswords || {}) as Record<string, StatementPassword>;
  const status = (link.statementStatus || {}) as Record<string, StatementState>;
  const ticked: string[] | null = link.banks && link.banks.length ? link.banks : null;
  const groups = new Map<string, StatementGroup>();
  for (const s of index) {
    const slot = statementSlot(s.bankId, s.kind);
    const g = groups.get(slot) || {
      bankId: s.bankId, bankName: s.bankName, kind: s.kind, count: 0, latest: 0, locked: null as boolean | null,
      hasPassword: !!passwords[slot], wrongPassword: status[slot]?.state === 'wrong_password',
      selected: !ticked || ticked.includes(s.bankId) || (s.bankId.startsWith('in_') && ticked.includes('otherbankin')),
    };
    g.count += 1;
    g.latest = Math.max(g.latest, s.date);
    if (s.locked === true) g.locked = true;
    else if (s.locked === false && g.locked === null) g.locked = false;
    groups.set(slot, g);
  }
  const all = [...groups.values()].sort((a, b) => Number(b.locked === true) - Number(a.locked === true) || b.latest - a.latest);
  return { accounts: all.filter((g) => g.kind === 'account'), cards: all.filter((g) => g.kind === 'card') };
}
