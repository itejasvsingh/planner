import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { bankNameById } from '../../../../lib/bankSenders';
import { accountBalances, cardSummaries } from '../../../../lib/moneyAccounts';
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
