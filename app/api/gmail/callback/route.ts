import { NextResponse } from 'next/server';
import { finishConnect } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';

/** Google sends the user back here after the consent screen; we return them to Settings → Gmail. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  let outcome: Awaited<ReturnType<typeof finishConnect>> = { returnTo: 'web', result: 'failed' };
  try {
    outcome = await finishConnect(code, state);
  } catch (e) {
    console.warn('Gmail connect finish failed:', (e as Error).message);
  }
  if (url.searchParams.get('error') === 'access_denied' && outcome.result !== 'connected') outcome.result = 'missing_scope';
  const query = `gmail=${outcome.result}`;
  const target = outcome.returnTo === 'app' ? `align://settings/gmail?${query}` : `${url.origin}/settings/gmail?${query}`;
  return NextResponse.redirect(target, 302);
}
