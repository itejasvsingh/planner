import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { dismissUnparsed, listUnparsed } from '../../../../lib/unparsed';

export const dynamic = 'force-dynamic';

/** The bank messages Align couldn't read (last 30 days). */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  return NextResponse.json({ items: await listUnparsed(user.phone) });
}

/** Body: { dismiss: id | 'all' }. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.dismiss !== 'string' || !/^[\w-]{1,40}$/.test(body.dismiss)) return NextResponse.json({ error: 'Which message?' }, { status: 400 });
  await dismissUnparsed(user.phone, body.dismiss);
  return NextResponse.json({ ok: true });
}
