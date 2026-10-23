import { NextResponse } from 'next/server';
import { linkEmailToAccount } from '../../../../../lib/emailAuth';

export const dynamic = 'force-dynamic';

/** Adds an email to the signed-in account. Body: { email, code } (the code from /api/auth/email/code); Authorization: Bearer <ID token>. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ status: 'error', message: 'Sign in first.' }, { status: 401 });
  const result = await linkEmailToAccount(String(body.email || ''), String(body.code || ''), auth.slice(7));
  if (result.status === 'error') return NextResponse.json({ status: 'error', message: result.message }, { status: result.http });
  return NextResponse.json(result);
}
