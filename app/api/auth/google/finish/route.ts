import { NextResponse } from 'next/server';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { redeemGoogleLogin } from '../../../../../lib/googleLogin';

export const dynamic = 'force-dynamic';

/** Body: { code, verifier }. Swaps the one-time code for a Firebase sign-in token (once, within 2 minutes). */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  if (!(await consumeRateLimit(`glogin_finish_ip_${ip}`, 30, 60 * 60 * 1000).catch(() => true))) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const token = await redeemGoogleLogin(String(body.code || ''), String(body.verifier || ''));
  return token ? NextResponse.json({ token }) : NextResponse.json({ error: 'That sign-in expired. Try again.' }, { status: 400 });
}
