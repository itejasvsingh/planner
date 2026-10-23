import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { removeSub } from '../../../../lib/webPush';

export const dynamic = 'force-dynamic';

/** Body: { endpoint }. Forgets this device. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.endpoint === 'string' && body.endpoint.length < 1000) await removeSub(user.phone, body.endpoint);
  return NextResponse.json({ ok: true });
}
