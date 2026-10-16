import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { bankNameById } from '../../../../lib/bankSenders';
import { accountBalances, cardSummaries, saveAccountEdit, type AccountEdit } from '../../../../lib/moneyAccounts';
import { statementLine, type StatementState } from '../../../../lib/statementAuto';

export const dynamic = 'force-dynamic';

/**
 * Credit cards (latest statement, due date, outstanding now), bank balances, and how the last statements
 * compared with what alerts recorded, for the signed-in user.
 */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const [cards, accounts, link] = await Promise.all([
    cardSummaries(user.phone),
    accountBalances(user.phone),
    db.collection('gmail_links').doc(user.phone).get().then((s) => s.data()),
  ]);
  const status = (link?.statementStatus || {}) as Record<string, StatementState>;
  // Every statement Align found (newest first): read ones are the checks; the rest wait for a password
  const checks = Object.entries(status)
    .map(([slot, s]) => {
      const bankId = slot.replace(/__card$/, '');
      return {
        slot,
        bankName: bankNameById(bankId),
        kind: slot.endsWith('__card') ? 'card' : 'account',
        from: s.from || null,
        to: s.to || null,
        rows: s.rows || 0,
        added: s.added || 0,
        checked: !!s.checked,
        extras: s.extras || [],
        at: s.at,
        state: s.state,
        msgId: s.msgId || null,
        foundAt: s.foundAt || null,
        line: statementLine(bankNameById(bankId), slot, s),
      };
    })
    .sort((a, b) => b.at - a.at);
  return NextResponse.json({ cards, accounts, checks });
}

const text = (v: unknown, re: RegExp, upper = false) => {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = (upper ? v.toUpperCase() : v).replace(/\s+/g, upper ? '' : ' ').trim();
  return re.test(t) ? t : undefined;
};

/** Body: { id, edit } where edit may hold excluded, ifsc, accountNumber, holder (null clears). Only known fields, checked. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const e = (body.edit && typeof body.edit === 'object' ? body.edit : {}) as Record<string, unknown>;
  if (typeof body.id !== 'string' || !/^[\w.-]{1,80}$/.test(body.id)) return NextResponse.json({ error: 'Which account?' }, { status: 400 });
  const edit: AccountEdit = {};
  if (typeof e.excluded === 'boolean') edit.excluded = e.excluded;
  const ifsc = text(e.ifsc, /^[A-Z]{4}0[A-Z0-9]{6}$/, true);
  if (ifsc !== undefined) edit.ifsc = ifsc;
  const num = text(e.accountNumber, /^\d{6,20}$/, true);
  if (num !== undefined) edit.accountNumber = num;
  const holder = text(e.holder, /^[A-Za-z][A-Za-z .'-]{1,59}$/);
  if (holder !== undefined) edit.holder = holder;
  if (e.ifsc !== undefined && ifsc === undefined) return NextResponse.json({ error: 'That IFSC code looks wrong (4 letters, 0, then 6 letters or digits).' }, { status: 400 });
  if (e.accountNumber !== undefined && num === undefined) return NextResponse.json({ error: 'An account number is 6 to 20 digits.' }, { status: 400 });
  await saveAccountEdit(user.phone, body.id, edit);
  return NextResponse.json({ ok: true });
}
