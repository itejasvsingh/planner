import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { syncGmail } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "Check now" in Settings → Gmail. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await consumeRateLimit(`gmailsync_${user.phone}`, 12, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Checked a lot just now. Try again later.' }, { status: 429 });
  }
  return NextResponse.json(await syncGmail(user.phone, Date.now() + 45_000));
}
