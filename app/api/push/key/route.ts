import { NextResponse } from 'next/server';
import { pushConfigured, vapidPublicKey } from '../../../../lib/webPush';

export const dynamic = 'force-dynamic';

/** The public key a browser needs to subscribe, and whether push is set up on the server at all (the key is public by design). */
export async function GET() {
  return NextResponse.json({ configured: pushConfigured(), publicKey: pushConfigured() ? vapidPublicKey() : null });
}
