import { NextResponse } from 'next/server';
import { finishConnect } from '../../../../lib/gmail';
import { finishGoogleLogin } from '../../../../lib/googleLogin';

export const dynamic = 'force-dynamic';

/** Google sends the user back here after the consent screen; we return them to Settings → Gmail. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  // "Sign in with Google" from the Android app / iPhone home-screen app shares this registered address
  if (state.startsWith('gl_')) {
    let target = `${url.origin}/login?google=failed`;
    try {
      target = await finishGoogleLogin(code, state, url.origin);
    } catch (e) {
      console.warn('Google login finish failed:', (e as Error).message);
    }
    return NextResponse.redirect(target, 302);
  }
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
