import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { deleteAccount } from '../../../../lib/accountData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Deletes the signed-in person's whole account and everything in it. Body: { confirm: 'DELETE' }. Cannot be undone. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (String(body.confirm || '').trim().toUpperCase() !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  if (!(await consumeRateLimit(`delete_${user.phone}`, 3, 60 * 60 * 1000).catch(() => true))) return NextResponse.json({ error: 'Too many tries. Wait an hour.' }, { status: 429 });
  const done = await deleteAccount(user.phone, user.uid);
  return NextResponse.json({ ok: true, deleted: { items: done.items } });
}
