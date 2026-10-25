import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { refreshBalances } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "Refresh balances" in Wallet: reads the latest balance each bank email quotes (SMS are rescanned by the app itself). */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await consumeRateLimit(`refreshbal_${user.phone}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Refreshed a lot just now. Try again later.' }, { status: 429 });
  }
  return NextResponse.json(await refreshBalances(user.phone, Date.now() + 45_000));
}
