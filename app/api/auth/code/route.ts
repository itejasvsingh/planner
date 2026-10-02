import { NextResponse } from 'next/server';
import { startPhoneLogin } from '../../../../lib/phoneAuth';

export const dynamic = 'force-dynamic';

/** Sends a WhatsApp login code. Body: { phone }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const result = await startPhoneLogin(String(body.phone || ''), ip);
  if (result.status === 'error') return NextResponse.json({ status: 'error', message: result.message }, { status: result.http });
  return NextResponse.json(result);
}
