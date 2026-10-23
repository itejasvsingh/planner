import { NextResponse } from 'next/server';
import { startEmailLogin } from '../../../../../lib/emailAuth';

export const dynamic = 'force-dynamic';

/** Emails a 6-digit sign-in code. Body: { email }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const result = await startEmailLogin(String(body.email || ''), ip);
  if (result.status === 'error') return NextResponse.json({ status: 'error', message: result.message }, { status: result.http });
  return NextResponse.json(result);
}
