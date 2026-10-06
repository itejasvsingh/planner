import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, db } from './firebase';
import { oauthClient, REDIRECT_URI } from './gmail';

/**
 * "Sign in with Google" where a pop-up can't work: the Android app and the iPhone home-screen web app.
 * Google's sign-in page opens in a browser tab (or the same window) and comes back through the redirect
 * address Connect Gmail already registered (/api/gmail/callback, state prefixed "gl_"). The server checks
 * who signed in, then hands the device a one-time code; the device swaps it, with the secret it made at the
 * start (PKCE-style, so a code caught by another app is useless), for a Firebase sign-in token. As with
 * Google sign-in on the web, the person then links their WhatsApp number with a code.
 * Only basic scopes (openid email profile) are asked for. Records live server-only in google_logins.
 */

export type LoginReturn = 'app' | 'web';
const TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 2 * 60 * 1000;
const sha = (s: string) => createHash('sha256').update(s).digest('base64url');
const logins = () => db.collection('google_logins');

/** `challenge`: base64url SHA-256 of a random secret the device keeps until it finishes. */
export async function startGoogleLogin(returnTo: LoginReturn, challenge: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error('Bad challenge');
  const { id } = oauthClient();
  const state = randomBytes(24).toString('base64url');
  await logins().doc(sha(state)).set({ returnTo, challenge, expiresAt: Date.now() + TTL_MS, used: false });
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: `gl_${state}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Google came back: learn who it is, and give the device a one-time code. Returns where to send the browser. */
export async function finishGoogleLogin(code: string, rawState: string, origin: string): Promise<string> {
  const state = rawState.replace(/^gl_/, '');
  const ref = logins().doc(sha(state));
  const snap = await ref.get();
  const rec = snap.data();
  const back = (returnTo: LoginReturn | undefined, q: string) => (returnTo === 'app' ? `align://login?${q}` : `${origin}/login?${q}`);
  if (!rec || rec.expiresAt < Date.now() || rec.used || rec.sub) return back(rec?.returnTo, 'google=expired');
  if (!code) return back(rec.returnTo, 'google=cancelled');
  const { id, secret } = oauthClient();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !tok.id_token) return back(rec.returnTo, 'google=failed');
  // Straight from Google's token endpoint over TLS, so its claims can be trusted without re-verifying
  const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1] || '', 'base64url').toString('utf8') || '{}');
  if (!claims.sub || claims.aud !== id) return back(rec.returnTo, 'google=failed');
  const oneTime = randomBytes(32).toString('base64url');
  await ref.update({ sub: String(claims.sub), email: claims.email_verified ? String(claims.email || '') : '', codeHash: sha(oneTime), codeExpires: Date.now() + CODE_TTL_MS });
  return back(rec.returnTo, `google=${oneTime}`);
}

/** The device swaps the one-time code and its secret for a Firebase sign-in token (once). */
export async function redeemGoogleLogin(oneTime: string, verifier: string): Promise<string | null> {
  if (!oneTime || !verifier || verifier.length < 43 || verifier.length > 128) return null;
  const q = await logins().where('codeHash', '==', sha(oneTime)).limit(1).get();
  const doc = q.docs[0];
  if (!doc) return null;
  return db.runTransaction(async (t) => {
    const rec = (await t.get(doc.ref)).data();
    if (!rec || rec.used || !rec.sub || Number(rec.codeExpires) < Date.now()) return null;
    const a = Buffer.from(sha(verifier));
    const b = Buffer.from(String(rec.challenge));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    t.update(doc.ref, { used: true, usedAt: Date.now() });
    return adminAuth().createCustomToken(`google_${rec.sub}`, rec.email ? { email: rec.email } : undefined);
  });
}
