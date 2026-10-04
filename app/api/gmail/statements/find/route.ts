import { NextResponse } from 'next/server';
import { requestUser } from '../../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { explain, findStatements, syncGmail } from '../../../../../lib/gmail';
import { statementGroups } from '../../../../../lib/statementAuto';
import { db } from '../../../../../lib/firebase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Find statements": reads up to six new statement PDFs now (instead of two per check), then looks through
 * the last 90 days of statement PDFs from your banks and checks which need a password. Returns the two
 * lists (bank accounts, credit cards).
 */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const allowed = await consumeRateLimit(`stmt_find_${user.phone}`, 6, 60 * 60 * 1000).catch(() => true);
  if (!allowed) return NextResponse.json({ error: 'Searched a lot this hour. Try again later.' }, { status: 429 });
  try {
    const sync = await syncGmail(user.phone, Date.now() + 25_000, { statements: 6 });
    const found = await findStatements(user.phone, 90, Date.now() + 25_000);
    if (found.status !== 'ok') return NextResponse.json({ status: found.status, accounts: [], cards: [], added: 0 });
    const link = (await db.collection('gmail_links').doc(user.phone).get()).data() || {};
    return NextResponse.json({ status: 'ok', ...statementGroups(link), searched: true, added: sync.added });
  } catch (e) {
    return NextResponse.json({ error: explain((e as Error).message) }, { status: 502 });
  }
}
