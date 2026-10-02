import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { GmailConfigError, startConnect } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';

/** Returns Google's consent URL for connecting Gmail. Body: { returnTo: 'web' | 'app' }. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  try {
    return NextResponse.json({ url: await startConnect(user.phone, body.returnTo === 'app' ? 'app' : 'web') });
  } catch (e) {
    console.warn('Gmail connect start failed:', (e as Error).message);
    const message = e instanceof GmailConfigError ? e.message : 'Could not start connecting Gmail. Try again.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
