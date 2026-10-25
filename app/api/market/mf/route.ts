import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { loadSchemes, searchSchemes } from '../../../../lib/amfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Finds mutual fund schemes by name for the signed-in person adding a holding: ?q=hdfc flexi cap */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await consumeRateLimit(`mfsearch_${user.phone}`, 120, 60 * 60 * 1000).catch(() => true))) return NextResponse.json({ error: 'Too many searches. Try again later.' }, { status: 429 });
  const q = new URL(req.url).searchParams.get('q') || '';
  if (q.trim().length < 3) return NextResponse.json({ schemes: [] });
  const all = await loadSchemes();
  return NextResponse.json({ schemes: searchSchemes(all.values(), q.slice(0, 80)), available: all.size > 0 });
}
