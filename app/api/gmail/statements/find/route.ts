import { NextResponse } from 'next/server';
import { requestUser } from '../../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { explain, findStatements, syncGmail } from '../../../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Find statements": reads up to six new statement PDFs now (instead of two per check), then lists every
 * statement and card bill email from your banks in the last 40 days with what happened to each.
 */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const allowed = await consumeRateLimit(`stmt_find_${user.phone}`, 6, 60 * 60 * 1000).catch(() => true);
  if (!allowed) return NextResponse.json({ error: 'Searched a lot this hour. Try again later.' }, { status: 429 });
  try {
    const sync = await syncGmail(user.phone, Date.now() + 35_000, { statements: 6 });
    const found = await findStatements(user.phone, 40);
    return NextResponse.json({ ...found, added: sync.added, message: sync.message || null });
  } catch (e) {
    return NextResponse.json({ error: explain((e as Error).message) }, { status: 502 });
  }
}
