import { NextResponse } from 'next/server';
import { verifyPhoneLogin } from '../../../../lib/phoneAuth';

export const dynamic = 'force-dynamic';

/**
 * Checks a WhatsApp login code. Body: { phone, code }. Returns a Firebase custom token, or, when the request
 * carries a signed-in user's ID token (Authorization: Bearer), links the number to that account.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const auth = req.headers.get('authorization');
  const idToken = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const result = await verifyPhoneLogin(String(body.phone || ''), String(body.code || ''), idToken);
  if (result.status === 'error') return NextResponse.json({ status: 'error', message: result.message }, { status: result.http });
  return NextResponse.json(result);
}
