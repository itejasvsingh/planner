import { NextResponse } from 'next/server';
import { verifyEmailLogin } from '../../../../../lib/emailAuth';

export const dynamic = 'force-dynamic';

/** Checks the emailed code. Body: { email, code }. Returns a Firebase custom token. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const result = await verifyEmailLogin(String(body.email || ''), String(body.code || ''));
  if (result.status === 'error') return NextResponse.json({ status: 'error', message: result.message }, { status: result.http });
  return NextResponse.json(result);
}
