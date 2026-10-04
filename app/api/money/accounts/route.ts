import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { accountBalances, cardSummaries } from '../../../../lib/moneyAccounts';

export const dynamic = 'force-dynamic';

/** Credit cards (latest statement, due date, outstanding now) and bank balances for the signed-in user. */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const [cards, accounts] = await Promise.all([cardSummaries(user.phone), accountBalances(user.phone)]);
  return NextResponse.json({ cards, accounts });
}
