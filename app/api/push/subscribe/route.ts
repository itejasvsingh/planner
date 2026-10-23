import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { cleanSub, pushConfigured, saveSub } from '../../../../lib/webPush';

export const dynamic = 'force-dynamic';

/** Body: { subscription } from the browser's PushManager. Saves this device for the signed-in person. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push isn’t set up on the server yet.' }, { status: 503 });
  if (!(await consumeRateLimit(`push_sub_${user.phone}`, 20, 60 * 60 * 1000).catch(() => true))) return NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sub = cleanSub(body.subscription);
  if (!sub) return NextResponse.json({ error: 'That doesn’t look like a push subscription.' }, { status: 400 });
  await saveSub(user.phone, sub);
  return NextResponse.json({ ok: true });
}
