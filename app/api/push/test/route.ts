import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { pushConfigured, sendToUser } from '../../../../lib/webPush';

export const dynamic = 'force-dynamic';

/** Sends one test notification to the signed-in person's subscribed devices. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push isn’t set up on the server yet.' }, { status: 503 });
  if (!(await consumeRateLimit(`push_test_${user.phone}`, 6, 60 * 60 * 1000).catch(() => true))) return NextResponse.json({ error: 'Too many tests. Try again later.' }, { status: 429 });
  const sent = await sendToUser(user.phone, { title: 'Align', body: 'Notifications are on. You’ll hear about card dues and tasks here.', url: '/wallet', tag: 'test' });
  return NextResponse.json({ ok: true, sent });
}
