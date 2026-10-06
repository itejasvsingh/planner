import { NextResponse } from 'next/server';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { startGoogleLogin } from '../../../../../lib/googleLogin';

export const dynamic = 'force-dynamic';

/** Body: { returnTo: 'app' | 'web', challenge }. Returns Google's sign-in URL (see lib/googleLogin.ts). */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  if (!(await consumeRateLimit(`glogin_ip_${ip}`, 30, 60 * 60 * 1000).catch(() => true))) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const returnTo = body.returnTo === 'app' ? 'app' : 'web';
  try {
    return NextResponse.json({ url: await startGoogleLogin(returnTo, String(body.challenge || '')) });
  } catch {
    return NextResponse.json({ error: 'Could not start Google sign-in.' }, { status: 400 });
  }
}
