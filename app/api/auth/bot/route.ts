import { NextResponse } from 'next/server';
import { botNumber } from '../../../../lib/whatsappSend';

export const dynamic = 'force-dynamic';

/** Align's WhatsApp number, so the login screen can open a chat with "Login" typed in. */
export async function GET() {
  const number = await botNumber();
  return number ? NextResponse.json({ number }) : NextResponse.json({ error: 'WhatsApp is not set up.' }, { status: 503 });
}
