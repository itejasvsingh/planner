import { after, NextResponse } from 'next/server';
import { requestUser } from '../../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { explain, findStatements } from '../../../../../lib/gmail';
import { readInBackground } from '../../../../../lib/statementReader';
import { statementGroups } from '../../../../../lib/statementAuto';
import { db } from '../../../../../lib/firebase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Find statements": looks through the last 90 days of statement PDFs from your banks, checks which need a
 * password, and answers with the two lists (bank accounts, credit cards) within ~20 seconds. Reading the
 * statements themselves (transactions, balance) continues in the background after the answer.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const allowed = await consumeRateLimit(`stmt_find_${user.phone}`, 15, 60 * 60 * 1000).catch(() => true);
  if (!allowed) return NextResponse.json({ error: 'Searched a lot this hour. Try again in a few minutes.' }, { status: 429 });
  try {
    const found = await findStatements(user.phone, 90, started + 20_000);
    if (found.status !== 'ok') return NextResponse.json({ status: found.status, accounts: [], cards: [], searched: false, reading: false });
    after(() => readInBackground(user.phone, started));
    const link = (await db.collection('gmail_links').doc(user.phone).get()).data() || {};
    return NextResponse.json({ status: 'ok', ...statementGroups(link), searched: true, reading: true });
  } catch (e) {
    return NextResponse.json({ error: explain((e as Error).message) }, { status: 502 });
  }
}
